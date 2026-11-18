import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService, type SolTransaction } from '../../infrastructure/database/database.service.js';
import {
  allocationRuns,
  bookings,
  drivers,
  employeeLocations,
  employees,
  offices,
  organizationSettings,
  otpRecords,
  passengerAssignments,
  shifts,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';
import { deriveAssignmentOtp, hashOtpCode } from '../../infrastructure/shared/otp.util.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  buildDriverCommuteIdentity,
  resolveLocalityDisplayLabel,
} from '../commutes/commutes.utils.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { resolveEffectiveVehicleCapacity } from '../vehicles/vehicles.module.js';
import {
  DEFAULT_ALLOCATION_POLICY,
  intervalsOverlapWithBuffer,
  solveLocalityIntervalAllocation,
  type AllocationBookingCandidate,
  type AllocationExistingTrip,
} from './allocation.engine.js';

export const autoAllocateSchema = z.object({
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
  shiftId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  commuteKey: z.string().trim().max(160).optional(),
  persistRun: z.boolean().default(true),
  policyOverrides: z
    .object({
      nearbyLocalityRadiusM: z.number().int().min(200).max(20_000).optional(),
      maxRouteDetourRatio: z.number().min(1.05).max(5).optional(),
      pickupWindowToleranceMinutes: z.number().int().min(5).max(120).optional(),
      driverTurnaroundBufferMinutes: z.number().int().min(0).max(180).optional(),
      arriveBySafetyBufferMinutes: z.number().int().min(0).max(60).optional(),
    })
    .optional(),
});
export type AutoAllocateDto = z.infer<typeof autoAllocateSchema>;

export const publishAllocationStopSchema = z.object({
  bookingId: z.string().uuid(),
  sequenceNo: z.number().int().min(1).max(100),
  scheduledArrivalAt: z.string().datetime(),
});

export const publishAllocationGroupSchema = z.object({
  clusterId: z.string().max(64).optional(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().uuid(),
  officeId: z.string().uuid(),
  direction: z.enum(TRIP_DIRECTIONS),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  plannedStartAt: z.string().datetime(),
  plannedEndAt: z.string().datetime().optional(),
  primaryLocalityId: z.string().uuid().nullable().optional(),
  rationale: z.record(z.string(), z.unknown()).nullable().optional(),
  stops: z.array(publishAllocationStopSchema).min(1).max(60),
});

export const publishAutoAllocationSchema = z.object({
  runId: z.string().uuid().optional(),
  groups: z.array(publishAllocationGroupSchema).min(1).max(100),
});
export type PublishAutoAllocationDto = z.infer<typeof publishAutoAllocationSchema>;

export async function acquireSortedAdvisoryLocksInTx(
  tx: SolTransaction,
  resourceKeys: string[],
): Promise<void> {
  const uniqueSorted = [...new Set(resourceKeys)].sort();
  for (const key of uniqueSorted) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

interface PublishedTripNotificationMeta {
  trip: typeof trips.$inferSelect;
  stops: Array<typeof tripStops.$inferSelect>;
  assignments: Array<typeof passengerAssignments.$inferSelect>;
  driverUserId: string;
  passengerMeta: Array<{
    userId: string;
    employeeId: string;
    assignmentId: string;
    stopId: string;
    stopLocationName: string;
    scheduledArrivalAt: Date;
    sequenceNo: number;
  }>;
}

@Injectable()
export class AutoAllocationService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly notifications: NotificationsService,
  ) {}

  listAllocationRuns(organizationId: string) {
    return this.dbService.db
      .select()
      .from(allocationRuns)
      .where(eq(allocationRuns.organizationId, organizationId))
      .orderBy(desc(allocationRuns.createdAt))
      .limit(20);
  }

  async generatePlan(identity: RequestIdentity, dto: AutoAllocateDto) {
    const [settingsRow] = await this.dbService.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, identity.organizationId))
      .limit(1);

    const policy = {
      nearbyLocalityRadiusM:
        dto.policyOverrides?.nearbyLocalityRadiusM ??
        settingsRow?.nearbyLocalityRadiusM ??
        DEFAULT_ALLOCATION_POLICY.nearbyLocalityRadiusM,
      maxRouteDetourRatio:
        dto.policyOverrides?.maxRouteDetourRatio ??
        settingsRow?.maxRouteDetourRatio ??
        DEFAULT_ALLOCATION_POLICY.maxRouteDetourRatio,
      pickupWindowToleranceMinutes:
        dto.policyOverrides?.pickupWindowToleranceMinutes ??
        settingsRow?.pickupWindowToleranceMinutes ??
        DEFAULT_ALLOCATION_POLICY.pickupWindowToleranceMinutes,
      driverTurnaroundBufferMinutes:
        dto.policyOverrides?.driverTurnaroundBufferMinutes ??
        settingsRow?.driverTurnaroundBufferMinutes ??
        DEFAULT_ALLOCATION_POLICY.driverTurnaroundBufferMinutes,
      arriveBySafetyBufferMinutes:
        dto.policyOverrides?.arriveBySafetyBufferMinutes ??
        settingsRow?.arriveBySafetyBufferMinutes ??
        DEFAULT_ALLOCATION_POLICY.arriveBySafetyBufferMinutes,
    };

    const conditions = [
      eq(bookings.organizationId, identity.organizationId),
      eq(bookings.status, 'APPROVED'),
      isNull(passengerAssignments.id),
    ];
    if (dto.travelDate) conditions.push(eq(bookings.travelDate, dto.travelDate));
    if (dto.direction) conditions.push(eq(bookings.direction, dto.direction));
    if (dto.shiftId) conditions.push(eq(bookings.shiftId, dto.shiftId));
    if (dto.officeId) conditions.push(eq(bookings.officeId, dto.officeId));
    if (dto.commuteKey) conditions.push(eq(bookings.commuteKey, dto.commuteKey));

    const [approvedRows, orgDrivers, orgVehicles, existingTripRows] = await Promise.all([
      this.dbService.db
        .select({
          bookingId: bookings.id,
          employeeId: employees.id,
          employeeCode: employees.employeeCode,
          employeeName: users.fullName,
          department: employees.department,
          officeId: offices.id,
          officeName: offices.name,
          officeLatitude: offices.latitude,
          officeLongitude: offices.longitude,
          shiftId: shifts.id,
          shiftName: shifts.name,
          shiftCode: shifts.code,
          shiftTimeLocal: shifts.shiftTimeLocal,
          travelDate: bookings.travelDate,
          direction: bookings.direction,
          timePreference: bookings.timePreference,
          requestedTimeLocal: bookings.requestedTimeLocal,
          timezone: bookings.timezone,
          requestedPickupAt: bookings.requestedPickupAt,
          scheduledPickupAt: bookings.scheduledPickupAt,
          isArriveByInfeasible: bookings.isArriveByInfeasible,
          feasibilityNote: bookings.feasibilityNote,
          pickupLocationId: employeeLocations.id,
          pickupLocationName: employeeLocations.locationName,
          address: employeeLocations.address,
          corridorTag: employeeLocations.corridorTag,
          localityId: employeeLocations.localityId,
          normalizedLocality: employeeLocations.normalizedLocality,
          latitude: employeeLocations.latitude,
          longitude: employeeLocations.longitude,
        })
        .from(bookings)
        .innerJoin(employees, eq(bookings.employeeId, employees.id))
        .innerJoin(users, eq(employees.userId, users.id))
        .innerJoin(offices, eq(bookings.officeId, offices.id))
        .innerJoin(shifts, eq(bookings.shiftId, shifts.id))
        .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
        .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
        .where(and(...conditions)),
      this.dbService.db
        .select({
          id: drivers.id,
          vendorId: drivers.vendorId,
          driverCode: drivers.driverCode,
          fullName: users.fullName,
          assignedVehicleId: drivers.assignedVehicleId,
          baseLocalityId: drivers.baseLocalityId,
          baseLocalityName: drivers.baseLocalityName,
          baseLatitude: drivers.baseLatitude,
          baseLongitude: drivers.baseLongitude,
          availabilityStatus: drivers.availabilityStatus,
          isSuspended: drivers.isSuspended,
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id))
        .where(eq(drivers.organizationId, identity.organizationId)),
      this.dbService.db
        .select({
          id: vehicles.id,
          vendorId: vehicles.vendorId,
          registrationNo: vehicles.registrationNo,
          modelName: vehicles.modelName,
          vehicleType: vehicles.vehicleType,
          seatingCapacity: vehicles.seatingCapacity,
          availabilityStatus: vehicles.availabilityStatus,
          isActive: vehicles.isActive,
        })
        .from(vehicles)
        .where(eq(vehicles.organizationId, identity.organizationId)),
      this.dbService.db
        .select({
          tripId: trips.id,
          tripCode: trips.tripCode,
          driverId: trips.driverId,
          driverName: users.fullName,
          vehicleId: trips.vehicleId,
          vehicleRegistrationNo: vehicles.registrationNo,
          vehicleType: vehicles.vehicleType,
          seatingCapacity: vehicles.seatingCapacity,
          status: trips.status,
          travelDate: trips.travelDate,
          direction: trips.direction,
          officeId: trips.officeId,
          officeName: offices.name,
          shiftId: trips.shiftId,
          plannedStartAt: trips.plannedStartAt,
          plannedEndAt: trips.plannedEndAt,
          primaryLocalityId: trips.primaryLocalityId,
        })
        .from(trips)
        .innerJoin(offices, eq(trips.officeId, offices.id))
        .leftJoin(drivers, eq(trips.driverId, drivers.id))
        .leftJoin(users, eq(drivers.userId, users.id))
        .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
        .where(
          and(
            eq(trips.organizationId, identity.organizationId),
            inArray(trips.status, ['CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS']),
            ...(dto.travelDate ? [eq(trips.travelDate, dto.travelDate)] : []),
          ),
        ),
    ]);

    const tripIds = existingTripRows.map((t) => t.tripId);
    const [tripCounts, tripStopRows] =
      tripIds.length > 0
        ? await Promise.all([
            this.dbService.db
              .select({
                tripId: passengerAssignments.tripId,
                count: sql<number>`count(*)::int`,
              })
              .from(passengerAssignments)
              .where(
                and(
                  inArray(passengerAssignments.tripId, tripIds),
                  sql`${passengerAssignments.status} <> 'CANCELLED'`,
                ),
              )
              .groupBy(passengerAssignments.tripId),
            this.dbService.db
              .select({
                tripId: tripStops.tripId,
                latitude: tripStops.latitude,
                longitude: tripStops.longitude,
              })
              .from(tripStops)
              .where(inArray(tripStops.tripId, tripIds)),
          ])
        : [[], []];

    const countByTrip = new Map(tripCounts.map((c) => [c.tripId, c.count]));
    const stopsByTrip = new Map<string, Array<{ latitude: number; longitude: number }>>();
    for (const s of tripStopRows) {
      const list = stopsByTrip.get(s.tripId) ?? [];
      list.push({ latitude: s.latitude, longitude: s.longitude });
      stopsByTrip.set(s.tripId, list);
    }

    const existingTrips: AllocationExistingTrip[] = existingTripRows.map((t) => ({
      tripId: t.tripId,
      tripCode: t.tripCode,
      driverId: t.driverId,
      driverName: t.driverName ?? null,
      vehicleId: t.vehicleId,
      vehicleRegistrationNo: t.vehicleRegistrationNo ?? null,
      vehicleType: t.vehicleType ?? null,
      seatingCapacity: t.seatingCapacity ?? null,
      passengerCount: countByTrip.get(t.tripId) ?? 0,
      status: t.status,
      travelDate: t.travelDate,
      direction: t.direction,
      officeId: t.officeId,
      officeName: t.officeName,
      shiftId: t.shiftId,
      plannedStartAt: t.plannedStartAt ? t.plannedStartAt.toISOString() : null,
      plannedEndAt: t.plannedEndAt ? t.plannedEndAt.toISOString() : null,
      primaryLocalityId: t.primaryLocalityId,
      primaryLocalityName: null,
      stopCoords: stopsByTrip.get(t.tripId) ?? [],
    }));

    const candidates: AllocationBookingCandidate[] = approvedRows.map((r) => ({
      ...r,
      requestedPickupAt: r.requestedPickupAt ? r.requestedPickupAt.toISOString() : null,
      scheduledPickupAt: r.scheduledPickupAt.toISOString(),
    }));

    // Detect overlapping/duplicate active bookings for same employee + date + direction
    const conflictBuckets = new Map<string, AllocationBookingCandidate[]>();
    for (const c of candidates) {
      const key = `${c.employeeId}::${c.travelDate}::${c.direction}`;
      const arr = conflictBuckets.get(key) ?? [];
      arr.push(c);
      conflictBuckets.set(key, arr);
    }
    const conflictingBookings = [...conflictBuckets.values()]
      .filter((arr) => arr.length > 1)
      .map((arr) => ({
        employeeId: arr[0].employeeId,
        employeeCode: arr[0].employeeCode,
        employeeName: arr[0].employeeName,
        travelDate: arr[0].travelDate,
        direction: arr[0].direction,
        bookingIds: arr.map((b) => b.bookingId),
        reason: `${arr.length} overlapping approved bookings on ${arr[0].travelDate} (${arr[0].direction}).`,
      }));

    const solved = solveLocalityIntervalAllocation({
      bookings: candidates,
      drivers: orgDrivers,
      vehicles: orgVehicles,
      existingTrips,
      policy,
    });

    let runId: string | null = null;
    if (dto.persistRun) {
      const [insertedRun] = await this.dbService.db
        .insert(allocationRuns)
        .values({
          organizationId: identity.organizationId,
          createdByUserId: identity.userId,
          travelDate: dto.travelDate ?? null,
          shiftId: dto.shiftId ?? null,
          officeId: dto.officeId ?? null,
          direction: dto.direction ?? null,
          engineVersion: solved.engineVersion,
          configSnapshotJson: solved.configSnapshot as unknown as Record<string, unknown>,
          summaryJson: solved.summary as unknown as Record<string, unknown>,
          proposalsJson: {
            proposals: solved.proposals,
            unallocatedGroups: solved.unallocatedGroups,
            spareSeatSuggestions: solved.spareSeatSuggestions,
          },
        })
        .returning({ id: allocationRuns.id });
      runId = insertedRun.id;
    }

    return {
      runId,
      generatedAt: new Date().toISOString(),
      ...solved,
      conflictingBookings,
    };
  }

  async publishAllocation(identity: RequestIdentity, dto: PublishAutoAllocationDto) {
    const seenBookings = new Set<string>();
    for (const group of dto.groups) {
      const seqSet = new Set(group.stops.map((s) => s.sequenceNo));
      if (seqSet.size !== group.stops.length) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Stop sequence numbers must be unique within each trip proposal.',
        });
      }
      for (const s of group.stops) {
        if (seenBookings.has(s.bookingId)) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: `Booking ${s.bookingId} appears in multiple trip proposals.`,
          });
        }
        seenBookings.add(s.bookingId);
      }
    }

    const txResults = await this.dbService.transaction(async (tx) => {
      // Acquire deadlock-free sorted advisory locks across all drivers, vehicles, and bookings in batch
      const lockKeys: string[] = [];
      for (const g of dto.groups) {
        lockKeys.push(`driver:${g.driverId}`, `vehicle:${g.vehicleId}`);
        for (const s of g.stops) lockKeys.push(`booking:${s.bookingId}`);
      }
      await acquireSortedAdvisoryLocksInTx(tx, lockKeys);

      const [orgSetting] = await tx
        .select({
          requireBoardingOtp: organizationSettings.requireBoardingOtp,
          driverTurnaroundBufferMinutes: organizationSettings.driverTurnaroundBufferMinutes,
        })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1);

      const requireBoardingOtp = orgSetting?.requireBoardingOtp ?? true;
      const turnaroundBufferMinutes = orgSetting?.driverTurnaroundBufferMinutes ?? 20;

      const involvedDriverIds = [...new Set(dto.groups.map((g) => g.driverId))];
      const involvedVehicleIds = [...new Set(dto.groups.map((g) => g.vehicleId))];

      const existingTrips = await tx
        .select({
          id: trips.id,
          tripCode: trips.tripCode,
          driverId: trips.driverId,
          vehicleId: trips.vehicleId,
          travelDate: trips.travelDate,
          plannedStartAt: trips.plannedStartAt,
          plannedEndAt: trips.plannedEndAt,
        })
        .from(trips)
        .where(
          and(
            eq(trips.organizationId, identity.organizationId),
            inArray(trips.status, ['CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS']),
            or(
              inArray(trips.driverId, involvedDriverIds),
              inArray(trips.vehicleId, involvedVehicleIds),
            ),
          ),
        );

      const busyIntervals = existingTrips.map((t) => {
        const startMs = t.plannedStartAt
          ? t.plannedStartAt.getTime()
          : new Date(`${t.travelDate}T08:00:00Z`).getTime();
        const endMs = t.plannedEndAt ? t.plannedEndAt.getTime() : startMs + 60 * 60_000;
        return {
          driverId: t.driverId,
          vehicleId: t.vehicleId,
          startMs,
          endMs: Math.max(endMs, startMs + 15 * 60_000),
          tripCode: t.tripCode,
        };
      });

      let resolvedRunId: string | null = dto.runId ?? null;
      if (resolvedRunId) {
        const [runRow] = await tx
          .select({ id: allocationRuns.id })
          .from(allocationRuns)
          .where(
            and(
              eq(allocationRuns.id, resolvedRunId),
              eq(allocationRuns.organizationId, identity.organizationId),
            ),
          )
          .limit(1);
        if (!runRow) resolvedRunId = null;
      }

      if (!resolvedRunId) {
        const [publishRun] = await tx
          .insert(allocationRuns)
          .values({
            organizationId: identity.organizationId,
            createdByUserId: identity.userId,
            travelDate: dto.groups[0].travelDate,
            shiftId: dto.groups[0].shiftId,
            officeId: dto.groups[0].officeId,
            direction: dto.groups[0].direction,
            engineVersion: 'LOCALITY_INTERVAL_V1',
            configSnapshotJson: { turnaroundBufferMinutes },
            summaryJson: {
              publishedGroupsCount: dto.groups.length,
              publishedBookingsCount: seenBookings.size,
            },
            proposalsJson: { groups: dto.groups },
          })
          .returning({ id: allocationRuns.id });
        resolvedRunId = publishRun.id;
      }

      const published: PublishedTripNotificationMeta[] = [];

      for (const group of dto.groups) {
        const [[driver], [vehicle], [office], [shift]] = await Promise.all([
          tx
            .select()
            .from(drivers)
            .where(
              and(eq(drivers.id, group.driverId), eq(drivers.organizationId, identity.organizationId)),
            )
            .limit(1),
          tx
            .select()
            .from(vehicles)
            .where(
              and(
                eq(vehicles.id, group.vehicleId),
                eq(vehicles.organizationId, identity.organizationId),
              ),
            )
            .limit(1),
          tx
            .select()
            .from(offices)
            .where(
              and(eq(offices.id, group.officeId), eq(offices.organizationId, identity.organizationId)),
            )
            .limit(1),
          tx
            .select()
            .from(shifts)
            .where(
              and(eq(shifts.id, group.shiftId), eq(shifts.organizationId, identity.organizationId)),
            )
            .limit(1),
        ]);

        if (!driver || !vehicle || !office || !shift) {
          throw new NotFoundException({
            code: 'RESOURCE_NOT_FOUND',
            message: 'Driver, vehicle, office, or shift not found in active organization.',
          });
        }
        if (driver.isSuspended || driver.availabilityStatus === 'OFF_DUTY') {
          throw new UnprocessableEntityException({
            code: 'DRIVER_UNAVAILABLE',
            message: `Driver ${driver.driverCode} is suspended or off-duty.`,
          });
        }
        if (!vehicle.isActive || vehicle.availabilityStatus === 'MAINTENANCE') {
          throw new UnprocessableEntityException({
            code: 'VEHICLE_UNAVAILABLE',
            message: `Vehicle ${vehicle.registrationNo} is inactive or in maintenance.`,
          });
        }

        const effectiveCap = resolveEffectiveVehicleCapacity(
          vehicle.vehicleType,
          vehicle.seatingCapacity,
        );
        if (group.stops.length > effectiveCap) {
          throw new UnprocessableEntityException({
            code: 'VEHICLE_CAPACITY_EXCEEDED',
            message: `Assigned ${group.stops.length} passenger(s) exceeds ${vehicle.vehicleType} capacity (${effectiveCap}).`,
            details: {
              passengerCount: group.stops.length,
              effectiveCapacity: effectiveCap,
              vehicleType: vehicle.vehicleType,
            },
          });
        }

        const startDate = new Date(group.plannedStartAt);
        const endDate = group.plannedEndAt
          ? new Date(group.plannedEndAt)
          : new Date(startDate.getTime() + Math.max(45, group.stops.length * 15) * 60_000);
        const startMs = startDate.getTime();
        const endMs = Math.max(endDate.getTime(), startMs + 15 * 60_000);

        const conflicting = busyIntervals.find(
          (b) =>
            (b.driverId === driver.id || b.vehicleId === vehicle.id) &&
            intervalsOverlapWithBuffer(
              startMs,
              endMs,
              b.startMs,
              b.endMs,
              turnaroundBufferMinutes,
            ),
        );
        if (conflicting) {
          throw new ConflictException({
            code: 'DRIVER_OR_VEHICLE_INTERVAL_CONFLICT',
            message: `Driver ${driver.driverCode} or vehicle ${vehicle.registrationNo} has an overlapping trip (${conflicting.tripCode}) within ±${turnaroundBufferMinutes} min turnaround buffer.`,
            details: {
              conflictTripCode: conflicting.tripCode,
              driverId: driver.id,
              vehicleId: vehicle.id,
            },
          });
        }

        const groupBookingIds = group.stops.map((s) => s.bookingId);
        const [bookingRows, existingPassAssigns] = await Promise.all([
          tx
            .select({
              booking: bookings,
              location: employeeLocations,
              employee: employees,
            })
            .from(bookings)
            .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
            .innerJoin(employees, eq(bookings.employeeId, employees.id))
            .where(
              and(
                eq(bookings.organizationId, identity.organizationId),
                inArray(bookings.id, groupBookingIds),
              ),
            ),
          tx
            .select({ bookingId: passengerAssignments.bookingId })
            .from(passengerAssignments)
            .where(inArray(passengerAssignments.bookingId, groupBookingIds)),
        ]);

        if (bookingRows.length !== groupBookingIds.length) {
          throw new NotFoundException({
            code: 'RESOURCE_NOT_FOUND',
            message: 'One or more bookings do not exist in active organization.',
          });
        }
        if (existingPassAssigns.length > 0) {
          throw new ConflictException({
            code: 'BOOKING_ALREADY_DISPATCHED',
            message: 'One or more bookings were concurrently dispatched to another trip.',
            details: {
              dispatchedBookingIds: existingPassAssigns.map((a) => a.bookingId),
            },
          });
        }
        const notApproved = bookingRows.filter((r) => r.booking.status !== 'APPROVED');
        if (notApproved.length > 0) {
          throw new ConflictException({
            code: 'BOOKING_NOT_APPROVED',
            message: 'All bookings must be APPROVED before dispatch allocation.',
            details: { invalidBookingIds: notApproved.map((r) => r.booking.id) },
          });
        }

        const bookingMap = new Map(bookingRows.map((r) => [r.booking.id, r]));
        const inferredLocalityId =
          group.primaryLocalityId ?? bookingRows.find((r) => r.location.localityId)?.location.localityId ?? null;
        const primaryLocRow =
          bookingRows.find((r) => r.location.localityId === inferredLocalityId)?.location ??
          bookingRows[0].location;
        const driverCommute = buildDriverCommuteIdentity({
          officeId: group.officeId,
          officeName: office.name,
          shiftId: group.shiftId,
          shiftName: shift.name,
          shiftTimeLocal: shift.shiftTimeLocal,
          direction: group.direction,
          localityLabel: resolveLocalityDisplayLabel({
            normalizedLocality: primaryLocRow.normalizedLocality,
            corridorTag: primaryLocRow.corridorTag,
            locationName: primaryLocRow.locationName,
          }),
        });
        const tripCode = `TRP-${group.travelDate.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

        const [trip] = await tx
          .insert(trips)
          .values({
            organizationId: identity.organizationId,
            officeId: group.officeId,
            shiftId: group.shiftId,
            driverId: driver.id,
            vehicleId: vehicle.id,
            vendorId: vehicle.vendorId,
            primaryLocalityId: inferredLocalityId,
            commuteKey: driverCommute.commuteKey,
            commuteName: driverCommute.commuteName,
            allocationRunId: resolvedRunId,
            allocationRationaleJson: group.rationale ?? null,
            tripCode,
            travelDate: group.travelDate,
            direction: group.direction,
            status: 'ASSIGNED',
            currentStopSequence: 1,
            plannedStartAt: startDate,
            plannedEndAt: new Date(endMs),
          })
          .returning();

        const orderedInputStops = [...group.stops].sort((a, b) => a.sequenceNo - b.sequenceNo);
        const createdStops: Array<typeof tripStops.$inferSelect> = [];
        const createdAssignments: Array<typeof passengerAssignments.$inferSelect> = [];
        const passengerMeta: PublishedTripNotificationMeta['passengerMeta'] = [];

        for (let idx = 0; idx < orderedInputStops.length; idx++) {
          const stopInput = orderedInputStops[idx];
          const row = bookingMap.get(stopInput.bookingId)!;
          const normalizedSeq = idx + 1;

          const [stop] = await tx
            .insert(tripStops)
            .values({
              organizationId: identity.organizationId,
              tripId: trip.id,
              sequenceNo: normalizedSeq,
              stopType: group.direction === 'LOGIN' ? 'PICKUP' : 'DROP',
              locationName: row.location.locationName,
              address: row.location.address,
              latitude: row.location.latitude,
              longitude: row.location.longitude,
              location: { x: row.location.longitude, y: row.location.latitude },
              geofenceRadiusM: row.location.geofenceRadiusM,
              scheduledArrivalAt: new Date(stopInput.scheduledArrivalAt),
              status: 'PENDING',
            })
            .returning();
          createdStops.push(stop);

          const [assignment] = await tx
            .insert(passengerAssignments)
            .values({
              organizationId: identity.organizationId,
              tripId: trip.id,
              tripStopId: stop.id,
              bookingId: row.booking.id,
              employeeId: row.employee.id,
              status: 'SCHEDULED',
              scheduledPickupAt: new Date(stopInput.scheduledArrivalAt),
            })
            .returning();
          createdAssignments.push(assignment);

          if (requireBoardingOtp) {
            const boardingOtp = deriveAssignmentOtp(
              identity.organizationId,
              assignment.id,
              'BOARDING',
            );
            await tx.insert(otpRecords).values({
              organizationId: identity.organizationId,
              passengerAssignmentId: assignment.id,
              otpType: 'BOARDING',
              otpCodeHash: hashOtpCode(identity.organizationId, boardingOtp),
              expiresAt: new Date(new Date(stopInput.scheduledArrivalAt).getTime() + 12 * 3_600_000),
            });
          }

          passengerMeta.push({
            userId: row.employee.userId,
            employeeId: row.employee.id,
            assignmentId: assignment.id,
            stopId: stop.id,
            stopLocationName: row.location.locationName,
            scheduledArrivalAt: new Date(stopInput.scheduledArrivalAt),
            sequenceNo: normalizedSeq,
          });
        }

        if (group.direction === 'LOGIN') {
          const [officeStop] = await tx
            .insert(tripStops)
            .values({
              organizationId: identity.organizationId,
              tripId: trip.id,
              sequenceNo: orderedInputStops.length + 1,
              stopType: 'OFFICE',
              locationName: office.name,
              address: office.address,
              latitude: office.latitude,
              longitude: office.longitude,
              location: { x: office.longitude, y: office.latitude },
              geofenceRadiusM: office.geofenceRadiusM,
              scheduledArrivalAt: new Date(endMs),
              status: 'PENDING',
            })
            .returning();
          createdStops.push(officeStop);
        }

        await tx
          .update(bookings)
          .set({ status: 'DISPATCHED', updatedAt: new Date() })
          .where(inArray(bookings.id, groupBookingIds));

        await tx.insert(tripEvents).values({
          organizationId: identity.organizationId,
          tripId: trip.id,
          actorUserId: identity.userId,
          actorRole: identity.role,
          eventType: 'TRIP_AUTO_ALLOCATED',
          clientEventId: crypto.randomUUID(),
          occurredAtClient: new Date(),
          payloadJson: {
            tripCode,
            allocationRunId: resolvedRunId,
            driverId: driver.id,
            vehicleId: vehicle.id,
            stopCount: orderedInputStops.length,
            rationale: group.rationale ?? null,
          },
        });

        await this.auditLogs.recordInTx(tx, {
          organizationId: identity.organizationId,
          actorUserId: identity.userId,
          actorRole: identity.role,
          action: 'TRIP_DISPATCHED_AUTO',
          entityType: 'trip',
          entityId: trip.id,
          afterJson: {
            tripCode,
            allocationRunId: resolvedRunId,
            driverId: driver.id,
            vehicleId: vehicle.id,
            bookingIds: groupBookingIds,
          },
        });

        await this.outbox.enqueueInTx(tx, {
          organizationId: identity.organizationId,
          topic: TRANSPORT_TOPICS.ASSIGNMENT_EVENTS,
          aggregateType: 'trip',
          aggregateId: trip.id,
          payload: {
            event: 'trip.dispatched',
            tripId: trip.id,
            tripCode,
            driverId: driver.id,
            vehicleId: vehicle.id,
            passengerCount: orderedInputStops.length,
          },
        });

        busyIntervals.push({
          driverId: driver.id,
          vehicleId: vehicle.id,
          startMs,
          endMs,
          tripCode,
        });

        published.push({
          trip,
          stops: createdStops,
          assignments: createdAssignments,
          driverUserId: driver.userId,
          passengerMeta,
        });
      }

      return { runId: resolvedRunId, published };
    });

    // Consolidate batch dispatch notifications per (recipient, commuteKey) so multi-week allocations
    // send 1 concise commute notification instead of 30 duplicate trip-assigned entries.
    const driverCommuteBatches = new Map<
      string,
      {
        recipientUserId: string;
        driverId: string | null;
        commuteKey: string;
        commuteName: string;
        items: PublishedTripNotificationMeta[];
      }
    >();
    const empCommuteBatches = new Map<
      string,
      {
        userId: string;
        employeeId: string;
        commuteKey: string;
        commuteName: string;
        entries: Array<{
          trip: typeof trips.$inferSelect;
          meta: PublishedTripNotificationMeta['passengerMeta'][number];
        }>;
      }
    >();

    for (const item of txResults.published) {
      this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.status.changed', {
        tripId: item.trip.id,
        tripCode: item.trip.tripCode,
        status: item.trip.status,
        serverTime: new Date().toISOString(),
      });
      if (item.trip.driverId) {
        this.gateway.emitToRoom(WS_ROOMS.driver(item.trip.driverId), 'trip.status.changed', {
          tripId: item.trip.id,
          tripCode: item.trip.tripCode,
          status: item.trip.status,
        });
      }

      const commuteKey = item.trip.commuteKey ?? item.trip.id;
      const commuteName = item.trip.commuteName ?? item.trip.tripCode;
      const drvBatchKey = `${item.driverUserId}:${commuteKey}`;
      const existingDrv = driverCommuteBatches.get(drvBatchKey);
      if (existingDrv) {
        existingDrv.items.push(item);
      } else {
        driverCommuteBatches.set(drvBatchKey, {
          recipientUserId: item.driverUserId,
          driverId: item.trip.driverId,
          commuteKey,
          commuteName,
          items: [item],
        });
      }

      for (const p of item.passengerMeta) {
        const empBatchKey = `${p.userId}:${commuteKey}`;
        const existingEmp = empCommuteBatches.get(empBatchKey);
        if (existingEmp) {
          existingEmp.entries.push({ trip: item.trip, meta: p });
        } else {
          empCommuteBatches.set(empBatchKey, {
            userId: p.userId,
            employeeId: p.employeeId,
            commuteKey,
            commuteName,
            entries: [{ trip: item.trip, meta: p }],
          });
        }

        await this.notifications.schedulePrePickupReminder({
          organizationId: identity.organizationId,
          tripId: item.trip.id,
          stopId: p.stopId,
          passengerAssignmentId: p.assignmentId,
          recipientUserId: p.userId,
          employeeId: p.employeeId,
          tripCode: item.trip.tripCode,
          stopLocationName: p.stopLocationName,
          scheduledArrivalAt: p.scheduledArrivalAt,
        });
      }
    }

    for (const drvBatch of driverCommuteBatches.values()) {
      const sortedDates = [...new Set(drvBatch.items.map((i) => i.trip.travelDate))].sort();
      const firstItem = drvBatch.items[0];
      if (drvBatch.items.length === 1) {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: drvBatch.recipientUserId,
          driverId: drvBatch.driverId,
          tripId: firstItem.trip.id,
          channel: 'PUSH',
          category: 'TRIP_DISPATCHED',
          title: `New Trip Assigned · ${firstItem.trip.tripCode}`,
          body: `${firstItem.passengerMeta.length} stop(s) assigned for ${firstItem.trip.travelDate}.`,
          metadataJson: {
            tripId: firstItem.trip.id,
            tripCode: firstItem.trip.tripCode,
            commuteKey: drvBatch.commuteKey,
          },
          dedupKey: `disp-drv-${firstItem.trip.id}`,
        });
      } else {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: drvBatch.recipientUserId,
          driverId: drvBatch.driverId,
          tripId: firstItem.trip.id,
          channel: 'PUSH',
          category: 'TRIP_DISPATCHED',
          title: `Commute Assigned · ${drvBatch.commuteName}`,
          body: `${drvBatch.items.length} scheduled dates (${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}) added to your commute calendar.`,
          metadataJson: {
            commuteKey: drvBatch.commuteKey,
            commuteName: drvBatch.commuteName,
            tripCount: drvBatch.items.length,
            startDate: sortedDates[0],
            endDate: sortedDates[sortedDates.length - 1],
          },
          dedupKey: `disp-drv-batch-${txResults.runId}-${drvBatch.commuteKey}`,
        });
      }
    }

    for (const empBatch of empCommuteBatches.values()) {
      const sortedDates = [...new Set(empBatch.entries.map((e) => e.trip.travelDate))].sort();
      const firstEntry = empBatch.entries[0];
      if (empBatch.entries.length === 1) {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: empBatch.userId,
          employeeId: empBatch.employeeId,
          tripId: firstEntry.trip.id,
          channel: 'PUSH',
          category: 'TRIP_DISPATCHED',
          title: `Cab assigned · ${firstEntry.trip.tripCode}`,
          body: `Stop #${firstEntry.meta.sequenceNo} at ${firstEntry.meta.stopLocationName}.`,
          metadataJson: {
            tripId: firstEntry.trip.id,
            tripCode: firstEntry.trip.tripCode,
            assignmentId: firstEntry.meta.assignmentId,
            sequenceNo: firstEntry.meta.sequenceNo,
          },
          dedupKey: `disp-emp-${firstEntry.meta.assignmentId}`,
        });
      } else {
        await this.notifications.enqueueNotification({
          organizationId: identity.organizationId,
          recipientUserId: empBatch.userId,
          employeeId: empBatch.employeeId,
          tripId: firstEntry.trip.id,
          channel: 'PUSH',
          category: 'TRIP_DISPATCHED',
          title: `Commute Dispatched · ${empBatch.commuteName}`,
          body: `${empBatch.entries.length} trips scheduled (${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}).`,
          metadataJson: {
            commuteKey: empBatch.commuteKey,
            tripCount: empBatch.entries.length,
            startDate: sortedDates[0],
            endDate: sortedDates[sortedDates.length - 1],
          },
          dedupKey: `disp-emp-batch-${txResults.runId}-${empBatch.commuteKey}`,
        });
      }
    }

    return {
      runId: txResults.runId,
      publishedCount: txResults.published.length,
      trips: txResults.published.map((item) => ({
        trip: item.trip,
        stops: item.stops,
        assignments: item.assignments,
      })),
    };
  }
}
