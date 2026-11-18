import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  bookings,
  drivers,
  employeeLocations,
  employees,
  notifications,
  offices,
  organizationSettings,
  otpRecords,
  passengerAssignments,
  shifts,
  tripEvents,
  trips,
  tripStops,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';
import { deriveAssignmentOtp, hashOtpCode } from '../../infrastructure/shared/otp.util.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsModule, AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  buildDriverCommuteIdentity,
  resolveLocalityDisplayLabel,
} from '../commutes/commutes.utils.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { resolveEffectiveVehicleCapacity } from '../vehicles/vehicles.module.js';
import {
  acquireSortedAdvisoryLocksInTx,
  autoAllocateSchema,
  AutoAllocationService,
  publishAutoAllocationSchema,
  type AutoAllocateDto,
  type PublishAutoAllocationDto,
} from './auto-allocation.service.js';

export const manualDispatchStopSchema = z.object({
  bookingId: z.string().uuid(),
  sequenceNo: z.number().int().min(1).max(100),
  scheduledArrivalAt: z.string().datetime(),
});

export const manualDispatchSchema = z.object({
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().uuid(),
  officeId: z.string().uuid(),
  direction: z.enum(TRIP_DIRECTIONS),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  plannedStartAt: z.string().datetime(),
  stops: z.array(manualDispatchStopSchema).min(1).max(60),
});
export type ManualDispatchDto = z.infer<typeof manualDispatchSchema>;

export const modifyDispatchSchema = z.object({
  reason: z.string().min(3).max(500),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  stopOrder: z
    .array(
      z.object({
        stopId: z.string().uuid(),
        sequenceNo: z.number().int().min(1).max(100),
        scheduledArrivalAt: z.string().datetime().optional(),
      }),
    )
    .optional(),
});
export type ModifyDispatchDto = z.infer<typeof modifyDispatchSchema>;

const uuidParamSchema = z.string().uuid();

@Injectable()
export class DispatchService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async publishManualDispatch(identity: RequestIdentity, dto: ManualDispatchDto) {
    const seqSet = new Set(dto.stops.map((s) => s.sequenceNo));
    if (seqSet.size !== dto.stops.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Pickup stop sequence numbers must be unique.',
      });
    }

    const bookingIds = dto.stops.map((s) => s.bookingId);
    if (new Set(bookingIds).size !== bookingIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Duplicate bookingIds in stop sequence.',
      });
    }

    const result = await this.dbService.transaction(async (tx) => {
      await acquireSortedAdvisoryLocksInTx(tx, [
        `driver:${dto.driverId}`,
        `vehicle:${dto.vehicleId}`,
        ...bookingIds.map((bId) => `booking:${bId}`),
      ]);

      const [[driver], [vehicle], [office], [shift]] = await Promise.all([
        tx
          .select()
          .from(drivers)
          .where(
            and(eq(drivers.id, dto.driverId), eq(drivers.organizationId, identity.organizationId)),
          )
          .limit(1),
        tx
          .select()
          .from(vehicles)
          .where(
            and(
              eq(vehicles.id, dto.vehicleId),
              eq(vehicles.organizationId, identity.organizationId),
            ),
          )
          .limit(1),
        tx
          .select()
          .from(offices)
          .where(
            and(eq(offices.id, dto.officeId), eq(offices.organizationId, identity.organizationId)),
          )
          .limit(1),
        tx
          .select()
          .from(shifts)
          .where(
            and(eq(shifts.id, dto.shiftId), eq(shifts.organizationId, identity.organizationId)),
          )
          .limit(1),
      ]);

      if (!driver || !vehicle || !office || !shift) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Driver, vehicle, office, or shift not found in active organization.',
        });
      }

      if (driver.isSuspended) {
        throw new UnprocessableEntityException({
          code: 'DRIVER_SUSPENDED',
          message: 'Cannot dispatch a suspended driver.',
        });
      }

      const effectiveCapacity = resolveEffectiveVehicleCapacity(
        vehicle.vehicleType,
        vehicle.seatingCapacity,
      );
      if (dto.stops.length > effectiveCapacity) {
        throw new UnprocessableEntityException({
          code: 'VEHICLE_CAPACITY_EXCEEDED',
          message: `Assigned ${dto.stops.length} passengers exceeds ${vehicle.vehicleType} capacity (${effectiveCapacity}).`,
          details: {
            passengerCount: dto.stops.length,
            seatingCapacity: effectiveCapacity,
            vehicleType: vehicle.vehicleType,
          },
        });
      }

      const bookingRows = await tx
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
            inArray(bookings.id, bookingIds),
          ),
        );

      if (bookingRows.length !== bookingIds.length) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'One or more bookings do not exist in active organization.',
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
      const tripCode = `TRP-${dto.travelDate.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const plannedStartDate = new Date(dto.plannedStartAt);
      const plannedEndDate = new Date(
        plannedStartDate.getTime() + Math.max(45, dto.stops.length * 15) * 60_000,
      );

      const firstLocRow =
        bookingRows.find((r) => r.location.localityId)?.location ?? bookingRows[0].location;
      const driverCommute = buildDriverCommuteIdentity({
        officeId: dto.officeId,
        officeName: office.name,
        shiftId: dto.shiftId,
        shiftName: shift.name,
        shiftTimeLocal: shift.shiftTimeLocal,
        direction: dto.direction,
        localityLabel: resolveLocalityDisplayLabel({
          normalizedLocality: firstLocRow.normalizedLocality,
          corridorTag: firstLocRow.corridorTag,
          locationName: firstLocRow.locationName,
        }),
      });

      const [trip] = await tx
        .insert(trips)
        .values({
          organizationId: identity.organizationId,
          officeId: dto.officeId,
          shiftId: dto.shiftId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          vendorId: vehicle.vendorId,
          primaryLocalityId:
            bookingRows.find((r) => r.location.localityId)?.location.localityId ?? null,
          commuteKey: driverCommute.commuteKey,
          commuteName: driverCommute.commuteName,
          tripCode,
          travelDate: dto.travelDate,
          direction: dto.direction,
          status: 'ASSIGNED',
          currentStopSequence: 1,
          plannedStartAt: plannedStartDate,
          plannedEndAt: plannedEndDate,
        })
        .returning();

      const orderedInputStops = [...dto.stops].sort((a, b) => a.sequenceNo - b.sequenceNo);
      const createdStops: Array<typeof tripStops.$inferSelect> = [];
      const createdAssignments: Array<typeof passengerAssignments.$inferSelect> = [];

      const [orgSetting] = await tx
        .select({ requireBoardingOtp: organizationSettings.requireBoardingOtp })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, identity.organizationId))
        .limit(1);
      const requireBoardingOtp = orgSetting?.requireBoardingOtp ?? true;
      const otpExpiresAt = new Date(new Date(dto.plannedStartAt).getTime() + 12 * 60 * 60 * 1000);

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
            stopType: dto.direction === 'LOGIN' ? 'PICKUP' : 'DROP',
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
            employeeId: row.booking.employeeId,
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
            expiresAt: otpExpiresAt,
          });
        }

        await tx.insert(notifications).values({
          organizationId: identity.organizationId,
          recipientUserId: row.employee.userId,
          channel: 'IN_APP',
          category: 'TRIP_DISPATCHED',
          title: `Cab assigned · ${trip.tripCode}`,
          body: `Pickup #${normalizedSeq} at ${row.location.locationName} (${vehicle.registrationNo}).`,
          metadataJson: {
            tripId: trip.id,
            tripCode: trip.tripCode,
            sequenceNo: normalizedSeq,
          },
        });
      }

      if (dto.direction === 'LOGIN') {
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
            status: 'PENDING',
          })
          .returning();
        createdStops.push(officeStop);
      }

      await tx
        .update(bookings)
        .set({ status: 'DISPATCHED', updatedAt: new Date() })
        .where(
          and(
            eq(bookings.organizationId, identity.organizationId),
            inArray(bookings.id, bookingIds),
          ),
        );

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId: trip.id,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'TRIP_DISPATCHED',
        clientEventId: crypto.randomUUID(),
        occurredAtClient: new Date(),
        payloadJson: {
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          passengerCount: createdAssignments.length,
        },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'TRIP_MANUAL_DISPATCHED',
        entityType: 'trip',
        entityId: trip.id,
        afterJson: {
          tripCode: trip.tripCode,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          bookingIds,
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
          tripCode: trip.tripCode,
          driverId: dto.driverId,
          passengerCount: createdAssignments.length,
        },
      });

      return {
        trip,
        stops: createdStops,
        assignments: createdAssignments,
        driverUserId: driver.userId,
        vehicleRegNo: vehicle.registrationNo,
        passengerMeta: orderedInputStops.map((stopInput, idx) => {
          const row = bookingMap.get(stopInput.bookingId)!;
          return {
            assignmentId: createdAssignments[idx].id,
            stopId: createdStops[idx].id,
            sequenceNo: idx + 1,
            employeeId: row.booking.employeeId,
            userId: row.employee.userId,
            stopLocationName: row.location.locationName,
            scheduledArrivalAt: new Date(stopInput.scheduledArrivalAt),
          };
        }),
      };
    });

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'trip.status.changed', {
      tripId: result.trip.id,
      tripCode: result.trip.tripCode,
      status: result.trip.status,
      serverTime: new Date().toISOString(),
    });
    if (result.trip.driverId) {
      this.gateway.emitToRoom(WS_ROOMS.driver(result.trip.driverId), 'trip.status.changed', {
        tripId: result.trip.id,
        tripCode: result.trip.tripCode,
        status: result.trip.status,
      });
    }

    await this.notifications.enqueueNotification({
      organizationId: identity.organizationId,
      recipientUserId: result.driverUserId,
      driverId: result.trip.driverId,
      tripId: result.trip.id,
      channel: 'PUSH',
      category: 'TRIP_DISPATCHED',
      title: `New Trip Assigned · ${result.trip.tripCode}`,
      body: `${result.passengerMeta.length} pickup stop(s) assigned for ${result.trip.travelDate}.`,
      metadataJson: { tripId: result.trip.id, tripCode: result.trip.tripCode },
      dedupKey: `disp-drv-${result.trip.id}`,
    });

    for (const p of result.passengerMeta) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: p.userId,
        employeeId: p.employeeId,
        tripId: result.trip.id,
        channel: 'PUSH',
        category: 'TRIP_DISPATCHED',
        title: `Cab assigned · ${result.trip.tripCode}`,
        body: `Pickup #${p.sequenceNo} at ${p.stopLocationName} (${result.vehicleRegNo}).`,
        metadataJson: {
          tripId: result.trip.id,
          tripCode: result.trip.tripCode,
          sequenceNo: p.sequenceNo,
        },
        persistDb: false,
        dedupKey: `disp-emp-${p.assignmentId}`,
      });

      await this.notifications.schedulePrePickupReminder({
        organizationId: identity.organizationId,
        tripId: result.trip.id,
        stopId: p.stopId,
        passengerAssignmentId: p.assignmentId,
        recipientUserId: p.userId,
        employeeId: p.employeeId,
        tripCode: result.trip.tripCode,
        stopLocationName: p.stopLocationName,
        scheduledArrivalAt: p.scheduledArrivalAt,
      });
    }

    return {
      trip: result.trip,
      stops: result.stops,
      assignments: result.assignments,
    };
  }

  async modifyDispatch(identity: RequestIdentity, tripId: string, dto: ModifyDispatchDto) {
    return this.dbService.transaction(async (tx) => {
      const [existingTrip] = await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, identity.organizationId)))
        .limit(1);

      if (!existingTrip) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Trip ${tripId} not found in organization.`,
        });
      }

      if (
        existingTrip.status === 'COMPLETED' ||
        existingTrip.status === 'CANCELLED' ||
        existingTrip.status === 'ABORTED'
      ) {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot modify trip in terminal status ${existingTrip.status}.`,
        });
      }

      if (dto.vehicleId) {
        const [veh] = await tx
          .select()
          .from(vehicles)
          .where(
            and(
              eq(vehicles.id, dto.vehicleId),
              eq(vehicles.organizationId, identity.organizationId),
            ),
          )
          .limit(1);
        if (!veh) {
          throw new NotFoundException({
            code: 'RESOURCE_NOT_FOUND',
            message: `Vehicle ${dto.vehicleId} not found.`,
          });
        }
        const activeAssignments = await tx
          .select({ id: passengerAssignments.id })
          .from(passengerAssignments)
          .where(eq(passengerAssignments.tripId, tripId));
        const effectiveReplacementCap = resolveEffectiveVehicleCapacity(
          veh.vehicleType,
          veh.seatingCapacity,
        );
        if (activeAssignments.length > effectiveReplacementCap) {
          throw new UnprocessableEntityException({
            code: 'VEHICLE_CAPACITY_EXCEEDED',
            message: `Replacement vehicle capacity (${effectiveReplacementCap}) is smaller than passenger count (${activeAssignments.length}).`,
          });
        }
      }

      const [updatedTrip] = await tx
        .update(trips)
        .set({
          ...(dto.driverId ? { driverId: dto.driverId } : {}),
          ...(dto.vehicleId ? { vehicleId: dto.vehicleId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(trips.id, tripId))
        .returning();

      if (dto.stopOrder && dto.stopOrder.length > 0) {
        // Shift sequence numbers temporarily to avoid unique constraint collision on (trip_id, sequence_no).
        for (let i = 0; i < dto.stopOrder.length; i++) {
          await tx
            .update(tripStops)
            .set({ sequenceNo: 1000 + i })
            .where(and(eq(tripStops.id, dto.stopOrder[i].stopId), eq(tripStops.tripId, tripId)));
        }
        for (const item of dto.stopOrder) {
          await tx
            .update(tripStops)
            .set({
              sequenceNo: item.sequenceNo,
              ...(item.scheduledArrivalAt
                ? { scheduledArrivalAt: new Date(item.scheduledArrivalAt) }
                : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(tripStops.id, item.stopId), eq(tripStops.tripId, tripId)));
        }
      }

      await tx.insert(tripEvents).values({
        organizationId: identity.organizationId,
        tripId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        eventType: 'TRIP_DISPATCH_MODIFIED',
        clientEventId: crypto.randomUUID(),
        occurredAtClient: new Date(),
        payloadJson: {
          reason: dto.reason,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          reorderedStops: dto.stopOrder?.length ?? 0,
        },
      });

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'TRIP_DISPATCH_MODIFIED',
        entityType: 'trip',
        entityId: tripId,
        reason: dto.reason,
        beforeJson: {
          driverId: existingTrip.driverId,
          vehicleId: existingTrip.vehicleId,
        },
        afterJson: {
          driverId: updatedTrip.driverId,
          vehicleId: updatedTrip.vehicleId,
        },
      });

      const stops = await tx
        .select()
        .from(tripStops)
        .where(eq(tripStops.tripId, tripId))
        .orderBy(asc(tripStops.sequenceNo));

      return { trip: updatedTrip, stops };
    });
  }
}

@ApiTags('Admin - Dispatch')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/dispatch')
export class DispatchController {
  constructor(
    private readonly service: DispatchService,
    private readonly autoAllocation: AutoAllocationService,
  ) {}

  @Post('auto-allocate')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary:
      'Generate location-first, capacity-strict, interval-aware driver & vehicle allocation proposals',
  })
  autoAllocate(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: autoAllocateSchema }) dto: AutoAllocateDto,
  ) {
    return this.autoAllocation.generatePlan(identity, dto);
  }

  @Post('auto-allocate/publish')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary:
      'Atomically validate capacity, interval availability, and booking locks to publish allocation batch',
  })
  publishAutoAllocate(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: publishAutoAllocationSchema }) dto: PublishAutoAllocationDto,
  ) {
    return this.autoAllocation.publishAllocation(identity, dto);
  }

  @Get('allocation-runs')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({ summary: 'List recent auto-allocation engine snapshots and audit runs' })
  listAllocationRuns(@CurrentIdentity() identity: RequestIdentity) {
    return this.autoAllocation.listAllocationRuns(identity.organizationId);
  }

  @Post('manual')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({
    summary: 'Manually assign approved employees to driver/vehicle and publish stop sequence',
  })
  publishManual(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: manualDispatchSchema }) dto: ManualDispatchDto,
  ) {
    return this.service.publishManualDispatch(identity, dto);
  }

  @Patch(':tripId/modify')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER')
  @ApiOperation({ summary: 'Authorized last-minute modification of driver, vehicle, or stop order' })
  modify(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('tripId', { schema: uuidParamSchema }) tripId: string,
    @Body({ schema: modifyDispatchSchema }) dto: ModifyDispatchDto,
  ) {
    return this.service.modifyDispatch(identity, tripId, dto);
  }
}

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [DispatchController],
  providers: [DispatchService, AutoAllocationService],
  exports: [DispatchService, AutoAllocationService],
})
export class DispatchModule {}
