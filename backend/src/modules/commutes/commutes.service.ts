import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  auditLogs,
  bookings,
  bookingSeries,
  drivers,
  employeeLocations,
  employees,
  localities,
  offices,
  organizations,
  passengerAssignments,
  shifts,
  tripStops,
  trips,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import {
  TRIP_DIRECTIONS,
} from '../../infrastructure/shared/enums.js';
import { isPassengerPendingForRouting } from '../../infrastructure/shared/state-machines.js';
import { ApprovalsService } from '../approvals/approvals.module.js';
import {
  formatIsoDateInTimezone,
  formatTimeLocalInTimezone,
  getDayOfWeekForIsoDate,
} from '../bookings/bookings.calendar.js';
import { AutoAllocationService } from '../dispatch/auto-allocation.service.js';
import { DriversService } from '../drivers/drivers.module.js';
import { DriverExecutionService } from '../stops/stops.module.js';
import { resolveEffectiveVehicleCapacity } from '../vehicles/vehicles.module.js';
import {
  buildDriverCommuteIdentity,
  buildOperatorCommuteIdentity,
  formatReadableTime12h,
  resolveLocalityDisplayLabel,
} from './commutes.utils.js';

export const ADMIN_COMMUTE_BUCKETS = [
  'NEEDS_ATTENTION',
  'PENDING_APPROVAL',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'EXPIRED',
  'ALL',
] as const;
export type AdminCommuteBucket = (typeof ADMIN_COMMUTE_BUCKETS)[number];

export const listAdminCommutesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  bucket: z.enum(ADMIN_COMMUTE_BUCKETS).default('ALL'),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
  shiftId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  localityId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListAdminCommutesQuery = z.infer<typeof listAdminCommutesQuerySchema>;

export const approveCommuteDatesSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120).optional(),
  bookingIds: z.array(z.string().uuid()).max(200).optional(),
  decision: z.enum(['APPROVED', 'REJECTED']).default('APPROVED'),
  skipInfeasible: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
});
export type ApproveCommuteDatesDto = z.infer<typeof approveCommuteDatesSchema>;

export const allocateCommuteDatesSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  persistRun: z.boolean().default(true),
  publish: z.boolean().default(false),
  runId: z.string().uuid().optional(),
  groups: z
    .array(
      z.object({
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
        stops: z
          .array(
            z.object({
              bookingId: z.string().uuid(),
              sequenceNo: z.number().int().min(1).max(100),
              scheduledArrivalAt: z.string().datetime(),
            }),
          )
          .min(1)
          .max(60),
      }),
    )
    .max(100)
    .optional(),
});
export type AllocateCommuteDatesDto = z.infer<typeof allocateCommuteDatesSchema>;

export const driverCalendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type DriverCalendarQuery = z.infer<typeof driverCalendarQuerySchema>;

type AggregatedCommuteRow = {
  commute_key: string;
  direction: 'LOGIN' | 'LOGOUT';
  shift_id: string;
  shift_name: string;
  shift_time_local: string;
  office_id: string;
  office_name: string;
  locality_id: string | null;
  locality_label: string;
  time_preference: 'PICKUP_AT' | 'ARRIVE_BY';
  requested_time_local: string | null;
  timezone: string | null;
  start_date: string;
  end_date: string;
  scheduled_dates_count: number;
  employee_count: number;
  employee_preview: string[] | null;
  recurrence_types: string[] | null;
  weekday_sets: string[] | null;
  pending_approval_count: number;
  approved_count: number;
  dispatched_count: number;
  rejected_count: number;
  cancelled_count: number;
  expired_count: number;
  infeasible_count: number;
  unallocated_approved_count: number;
  active_trips_count: number;
  completed_trips_count: number;
  total_count: number;
};

@Injectable()
export class CommutesService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly approvalsService: ApprovalsService,
    private readonly autoAllocation: AutoAllocationService,
    private readonly driversService: DriversService,
    private readonly driverExecution: DriverExecutionService,
  ) {}

  async listAdminCommutes(organizationId: string, query: ListAdminCommutesQuery) {
    const preFilters = [sql`b.organization_id = ${organizationId}`];
    if (query.direction) preFilters.push(sql`b.direction = ${query.direction}`);
    if (query.shiftId) preFilters.push(sql`b.shift_id = ${query.shiftId}`);
    if (query.officeId) preFilters.push(sql`b.office_id = ${query.officeId}`);
    if (query.localityId) {
      preFilters.push(sql`COALESCE(el.locality_id, bs.locality_id) = ${query.localityId}`);
    }

    const bucketConditions: ReturnType<typeof sql>[] = [];
    if (query.bucket === 'NEEDS_ATTENTION') {
      bucketConditions.push(
        sql`(pending_approval_count > 0 OR unallocated_approved_count > 0 OR infeasible_count > 0)`,
      );
    } else if (query.bucket === 'PENDING_APPROVAL') {
      bucketConditions.push(sql`pending_approval_count > 0`);
    } else if (query.bucket === 'READY_TO_DISPATCH') {
      bucketConditions.push(sql`unallocated_approved_count > 0`);
    } else if (query.bucket === 'DISPATCHED') {
      bucketConditions.push(sql`dispatched_count > 0`);
    } else if (query.bucket === 'EXPIRED') {
      bucketConditions.push(
        sql`expired_count > 0 AND pending_approval_count = 0 AND approved_count = 0 AND dispatched_count = 0`,
      );
    }

    if (query.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim()}%`;
      bucketConditions.push(
        sql`(
          commute_key ILIKE ${pattern}
          OR locality_label ILIKE ${pattern}
          OR office_name ILIKE ${pattern}
          OR shift_name ILIKE ${pattern}
          OR employee_search_text ILIKE ${pattern}
        )`,
      );
    }

    const whereBucketClause =
      bucketConditions.length > 0 ? sql`WHERE ${sql.join(bucketConditions, sql` AND `)}` : sql``;
    const offset = (query.page - 1) * query.limit;

    const rawResult = await this.dbService.db.execute(sql`
      WITH base AS (
        SELECT
          COALESCE(b.commute_key, bs.commute_key, b.id::text) AS commute_key,
          b.id AS booking_id,
          b.series_id,
          b.travel_date::text AS travel_date,
          b.direction::text AS direction,
          b.shift_id,
          sh.name AS shift_name,
          sh.shift_time_local,
          b.office_id,
          off.name AS office_name,
          COALESCE(el.locality_id, bs.locality_id) AS locality_id,
          COALESCE(
            NULLIF(TRIM(loc.canonical_name), ''),
            NULLIF(TRIM(el.normalized_locality), ''),
            NULLIF(TRIM(el.corridor_tag), ''),
            el.location_name
          ) AS locality_label,
          b.time_preference::text AS time_preference,
          COALESCE(
            b.requested_time_local,
            to_char(b.scheduled_pickup_at AT TIME ZONE COALESCE(NULLIF(b.timezone, ''), 'Asia/Kolkata'), 'HH24:MI')
          ) AS requested_time_local,
          b.timezone,
          b.status::text AS booking_status,
          b.is_arrive_by_infeasible,
          b.employee_id,
          u.full_name AS employee_name,
          emp.employee_code,
          bs.recurrence_type::text AS recurrence_type,
          bs.selected_days_of_week,
          pa.id AS assignment_id,
          t.status::text AS trip_status
        FROM bookings b
        JOIN employees emp ON emp.id = b.employee_id
        JOIN users u ON u.id = emp.user_id
        JOIN shifts sh ON sh.id = b.shift_id
        JOIN offices off ON off.id = b.office_id
        JOIN employee_locations el ON el.id = b.pickup_location_id
        LEFT JOIN booking_series bs ON bs.id = b.series_id
        LEFT JOIN localities loc ON loc.id = COALESCE(el.locality_id, bs.locality_id)
        LEFT JOIN passenger_assignments pa ON pa.booking_id = b.id
        LEFT JOIN trips t ON t.id = pa.trip_id
        WHERE ${sql.join(preFilters, sql` AND `)}
      ),
      grouped AS (
        SELECT
          commute_key,
          MIN(direction) AS direction,
          MIN(shift_id::text) AS shift_id,
          MIN(shift_name) AS shift_name,
          MIN(shift_time_local) AS shift_time_local,
          MIN(office_id::text) AS office_id,
          MIN(office_name) AS office_name,
          MIN(locality_id::text) AS locality_id,
          MIN(locality_label) AS locality_label,
          MIN(time_preference) AS time_preference,
          MIN(requested_time_local) AS requested_time_local,
          MIN(timezone) AS timezone,
          MIN(travel_date) AS start_date,
          MAX(travel_date) AS end_date,
          COUNT(DISTINCT travel_date)::int AS scheduled_dates_count,
          COUNT(DISTINCT employee_id)::int AS employee_count,
          (ARRAY_AGG(DISTINCT employee_name ORDER BY employee_name))[1:4] AS employee_preview,
          STRING_AGG(DISTINCT employee_name || ' ' || employee_code, ' ') AS employee_search_text,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT recurrence_type), NULL) AS recurrence_types,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT selected_days_of_week), NULL) AS weekday_sets,
          COUNT(*) FILTER (WHERE booking_status = 'PENDING_APPROVAL')::int AS pending_approval_count,
          COUNT(*) FILTER (WHERE booking_status = 'APPROVED')::int AS approved_count,
          COUNT(*) FILTER (WHERE booking_status = 'DISPATCHED')::int AS dispatched_count,
          COUNT(*) FILTER (WHERE booking_status = 'REJECTED')::int AS rejected_count,
          COUNT(*) FILTER (WHERE booking_status = 'CANCELLED')::int AS cancelled_count,
          COUNT(*) FILTER (WHERE booking_status = 'EXPIRED')::int AS expired_count,
          COUNT(*) FILTER (WHERE is_arrive_by_infeasible = true AND booking_status IN ('PENDING_APPROVAL', 'APPROVED'))::int AS infeasible_count,
          COUNT(*) FILTER (WHERE booking_status = 'APPROVED' AND assignment_id IS NULL)::int AS unallocated_approved_count,
          COUNT(*) FILTER (WHERE trip_status IN ('ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS'))::int AS active_trips_count,
          COUNT(*) FILTER (WHERE trip_status = 'COMPLETED')::int AS completed_trips_count
        FROM base
        GROUP BY commute_key
      ),
      filtered AS (
        SELECT *, COUNT(*) OVER()::int AS total_count
        FROM grouped
        ${whereBucketClause}
      )
      SELECT *
      FROM filtered
      ORDER BY
        CASE
          WHEN pending_approval_count > 0 OR unallocated_approved_count > 0 OR infeasible_count > 0 THEN 0
          WHEN dispatched_count > 0 THEN 1
          ELSE 2
        END ASC,
        start_date ASC,
        locality_label ASC
      LIMIT ${query.limit}
      OFFSET ${offset}
    `);

    const rows = rawResult.rows as AggregatedCommuteRow[];
    const total = rows[0]?.total_count ?? 0;

    const items = rows.map((row) => {
      const built = buildOperatorCommuteIdentity({
        officeId: row.office_id,
        officeName: row.office_name,
        shiftId: row.shift_id,
        shiftName: row.shift_name,
        direction: row.direction,
        localityLabel: row.locality_label,
        timePreference: row.time_preference,
        requestedTimeLocal: row.requested_time_local,
      });

      const attentionCount =
        row.pending_approval_count + row.unallocated_approved_count + row.infeasible_count;

      let statusBadge:
        | 'NEEDS_ATTENTION'
        | 'PENDING_APPROVAL'
        | 'READY_TO_DISPATCH'
        | 'ALLOCATED'
        | 'COMPLETED'
        | 'EXPIRED' = 'ALLOCATED';
      if (row.infeasible_count > 0) {
        statusBadge = 'NEEDS_ATTENTION';
      } else if (row.pending_approval_count > 0) {
        statusBadge = 'PENDING_APPROVAL';
      } else if (row.unallocated_approved_count > 0) {
        statusBadge = 'READY_TO_DISPATCH';
      } else if (
        row.dispatched_count === 0 &&
        row.expired_count > 0 &&
        row.pending_approval_count === 0 &&
        row.approved_count === 0
      ) {
        statusBadge = 'EXPIRED';
      } else if (
        row.dispatched_count > 0 &&
        row.active_trips_count === 0 &&
        row.completed_trips_count > 0
      ) {
        statusBadge = 'COMPLETED';
      }

      const recurrenceList = row.recurrence_types ?? [];
      const recurrenceSummary =
        recurrenceList.length === 0
          ? 'ONE_DAY'
          : recurrenceList.length === 1
            ? recurrenceList[0]
            : 'MIXED';

      return {
        commuteKey: row.commute_key,
        commuteName: built.commuteName,
        direction: row.direction,
        localityId: row.locality_id,
        localityName: row.locality_label,
        officeId: row.office_id,
        officeName: row.office_name,
        shiftId: row.shift_id,
        shiftName: row.shift_name,
        shiftTimeLocal: row.shift_time_local,
        timePreference: row.time_preference,
        requestedTimeLocal: built.requestedTimeLocal,
        timezone: row.timezone ?? 'Asia/Kolkata',
        recurrenceSummary,
        selectedDaysOfWeek: (row.weekday_sets ?? [])[0] ?? null,
        startDate: row.start_date,
        endDate: row.end_date,
        scheduledDatesCount: row.scheduled_dates_count,
        employeeCount: row.employee_count,
        employeePreview: row.employee_preview ?? [],
        counts: {
          pendingApproval: row.pending_approval_count,
          approved: row.approved_count,
          dispatched: row.dispatched_count,
          rejected: row.rejected_count,
          cancelled: row.cancelled_count,
          expired: row.expired_count,
          infeasibleCount: row.infeasible_count,
          unallocatedApprovedCount: row.unallocated_approved_count,
          activeTripsCount: row.active_trips_count,
          completedTripsCount: row.completed_trips_count,
        },
        attentionCount,
        statusBadge,
      };
    });

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getAdminCommuteDetail(organizationId: string, commuteKey: string) {
    const bookingRows = await this.dbService.db
      .select({
        booking: bookings,
        series: bookingSeries,
        employee: employees,
        user: users,
        shift: shifts,
        office: offices,
        location: employeeLocations,
        locality: localities,
        assignment: passengerAssignments,
        trip: trips,
      })
      .from(bookings)
      .innerJoin(employees, eq(bookings.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .innerJoin(shifts, eq(bookings.shiftId, shifts.id))
      .innerJoin(offices, eq(bookings.officeId, offices.id))
      .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
      .leftJoin(bookingSeries, eq(bookings.seriesId, bookingSeries.id))
      .leftJoin(localities, eq(employeeLocations.localityId, localities.id))
      .leftJoin(passengerAssignments, eq(passengerAssignments.bookingId, bookings.id))
      .leftJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .where(and(eq(bookings.organizationId, organizationId), eq(bookings.commuteKey, commuteKey)))
      .orderBy(asc(bookings.travelDate), asc(bookings.scheduledPickupAt));

    if (bookingRows.length === 0) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Commute ${commuteKey} not found in active organization.`,
      });
    }

    const first = bookingRows[0];
    const localityLabel = resolveLocalityDisplayLabel({
      localityName: first.locality?.canonicalName,
      normalizedLocality: first.location.normalizedLocality,
      corridorTag: first.location.corridorTag,
      locationName: first.location.locationName,
    });
    const commuteMeta = buildOperatorCommuteIdentity({
      officeId: first.office.id,
      officeName: first.office.name,
      shiftId: first.shift.id,
      shiftName: first.shift.name,
      direction: first.booking.direction,
      localityLabel,
      timePreference: first.booking.timePreference,
      requestedTimeLocal: first.booking.requestedTimeLocal,
      scheduledPickupAt: first.booking.scheduledPickupAt,
      timezone: first.booking.timezone,
    });

    const tripIds = [
      ...new Set(bookingRows.map((r) => r.trip?.id).filter((id): id is string => Boolean(id))),
    ];
    const driverIds = [
      ...new Set(
        bookingRows.map((r) => r.trip?.driverId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const vehicleIds = [
      ...new Set(
        bookingRows.map((r) => r.trip?.vehicleId).filter((id): id is string => Boolean(id)),
      ),
    ];

    const [orgDrivers, orgVehicles, tripDriverUsers] = await Promise.all([
      this.dbService.db
        .select({
          driver: drivers,
          user: users,
          vehicle: vehicles,
          locality: localities,
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id))
        .leftJoin(vehicles, eq(drivers.assignedVehicleId, vehicles.id))
        .leftJoin(localities, eq(drivers.baseLocalityId, localities.id))
        .where(eq(drivers.organizationId, organizationId)),
      vehicleIds.length > 0
        ? this.dbService.db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
        : Promise.resolve([]),
      driverIds.length > 0
        ? this.dbService.db
            .select({ driverId: drivers.id, fullName: users.fullName, driverCode: drivers.driverCode })
            .from(drivers)
            .innerJoin(users, eq(drivers.userId, users.id))
            .where(inArray(drivers.id, driverIds))
        : Promise.resolve([]),
    ]);

    const vehicleMap = new Map(orgVehicles.map((v) => [v.id, v]));
    const tripDriverMap = new Map(tripDriverUsers.map((d) => [d.driverId, d]));

    // Build focused employee roster scoped strictly to this commute
    const employeeMap = new Map<
      string,
      {
        employeeId: string;
        employeeCode: string;
        employeeName: string;
        department: string;
        phone: string | null;
        pickupLocationId: string;
        pickupLocationName: string;
        pickupAddress: string;
        localityName: string;
        seriesId: string | null;
        recurrenceType: string;
        startDate: string | null;
        endDate: string | null;
        selectedDaysOfWeek: string | null;
        counts: {
          pendingApproval: number;
          approved: number;
          dispatched: number;
          rejected: number;
          cancelled: number;
          expired: number;
          infeasible: number;
        };
      }
    >();

    // Group occurrences date-by-date
    const dateMap = new Map<
      string,
      {
        travelDate: string;
        bookings: Array<{
          bookingId: string;
          seriesId: string | null;
          employeeId: string;
          employeeCode: string;
          employeeName: string;
          pickupLocationName: string;
          status: string;
          timePreference: string;
          requestedTimeLocal: string | null;
          scheduledPickupAt: string;
          isArriveByInfeasible: boolean;
          feasibilityNote: string | null;
          assignmentStatus: string | null;
          tripId: string | null;
          tripCode: string | null;
        }>;
        tripsMap: Map<
          string,
          {
            tripId: string;
            tripCode: string;
            status: string;
            plannedStartAt: string | null;
            driverId: string | null;
            driverName: string | null;
            driverCode: string | null;
            vehicleId: string | null;
            vehicleRegistrationNo: string | null;
            vehicleType: string | null;
            effectiveCapacity: number | null;
            passengerCount: number;
          }
        >;
      }
    >();

    const allBookingIds: string[] = [];
    const allSeriesIds = new Set<string>();
    const recurrenceSet = new Set<string>();
    const weekdaySet = new Set<string>();
    const counts = {
      pendingApproval: 0,
      approved: 0,
      dispatched: 0,
      rejected: 0,
      cancelled: 0,
      expired: 0,
      infeasibleCount: 0,
      unallocatedApprovedCount: 0,
    };

    for (const row of bookingRows) {
      allBookingIds.push(row.booking.id);
      if (row.series) {
        allSeriesIds.add(row.series.id);
        recurrenceSet.add(row.series.recurrenceType);
        weekdaySet.add(row.series.selectedDaysOfWeek);
      } else {
        recurrenceSet.add('ONE_DAY');
      }

      if (row.booking.status === 'PENDING_APPROVAL') counts.pendingApproval++;
      else if (row.booking.status === 'APPROVED') {
        counts.approved++;
        if (!row.assignment) counts.unallocatedApprovedCount++;
      } else if (row.booking.status === 'DISPATCHED') counts.dispatched++;
      else if (row.booking.status === 'REJECTED') counts.rejected++;
      else if (row.booking.status === 'CANCELLED') counts.cancelled++;
      else if (row.booking.status === 'EXPIRED') counts.expired++;
      if (
        row.booking.isArriveByInfeasible &&
        (row.booking.status === 'PENDING_APPROVAL' || row.booking.status === 'APPROVED')
      ) {
        counts.infeasibleCount++;
      }

      const empEntry = employeeMap.get(row.employee.id) ?? {
        employeeId: row.employee.id,
        employeeCode: row.employee.employeeCode,
        employeeName: row.user.fullName,
        department: row.employee.department,
        phone: row.user.phone,
        pickupLocationId: row.location.id,
        pickupLocationName: row.location.locationName,
        pickupAddress: row.location.address,
        localityName: resolveLocalityDisplayLabel({
          localityName: row.locality?.canonicalName,
          normalizedLocality: row.location.normalizedLocality,
          corridorTag: row.location.corridorTag,
          locationName: row.location.locationName,
        }),
        seriesId: row.series?.id ?? null,
        recurrenceType: row.series?.recurrenceType ?? 'ONE_DAY',
        startDate: row.series?.startDate ?? row.booking.travelDate,
        endDate: row.series?.endDate ?? row.booking.travelDate,
        selectedDaysOfWeek: row.series?.selectedDaysOfWeek ?? null,
        counts: {
          pendingApproval: 0,
          approved: 0,
          dispatched: 0,
          rejected: 0,
          cancelled: 0,
          expired: 0,
          infeasible: 0,
        },
      };

      const rowStart = row.series?.startDate ?? row.booking.travelDate;
      const rowEnd = row.series?.endDate ?? row.booking.travelDate;
      if (!empEntry.startDate || rowStart < empEntry.startDate) empEntry.startDate = rowStart;
      if (!empEntry.endDate || rowEnd > empEntry.endDate) empEntry.endDate = rowEnd;

      if (row.booking.status === 'PENDING_APPROVAL') empEntry.counts.pendingApproval++;
      else if (row.booking.status === 'APPROVED') empEntry.counts.approved++;
      else if (row.booking.status === 'DISPATCHED') empEntry.counts.dispatched++;
      else if (row.booking.status === 'REJECTED') empEntry.counts.rejected++;
      else if (row.booking.status === 'CANCELLED') empEntry.counts.cancelled++;
      else if (row.booking.status === 'EXPIRED') empEntry.counts.expired++;
      if (row.booking.isArriveByInfeasible) empEntry.counts.infeasible++;
      employeeMap.set(row.employee.id, empEntry);

      let dateEntry = dateMap.get(row.booking.travelDate);
      if (!dateEntry) {
        dateEntry = {
          travelDate: row.booking.travelDate,
          bookings: [],
          tripsMap: new Map(),
        };
      }

      dateEntry.bookings.push({
        bookingId: row.booking.id,
        seriesId: row.booking.seriesId,
        employeeId: row.employee.id,
        employeeCode: row.employee.employeeCode,
        employeeName: row.user.fullName,
        pickupLocationName: row.location.locationName,
        status: row.booking.status,
        timePreference: row.booking.timePreference,
        requestedTimeLocal: row.booking.requestedTimeLocal,
        scheduledPickupAt: row.booking.scheduledPickupAt.toISOString(),
        isArriveByInfeasible: row.booking.isArriveByInfeasible,
        feasibilityNote: row.booking.feasibilityNote,
        assignmentStatus: row.assignment?.status ?? null,
        tripId: row.trip?.id ?? null,
        tripCode: row.trip?.tripCode ?? null,
      });

      if (row.trip) {
        const veh = row.trip.vehicleId ? vehicleMap.get(row.trip.vehicleId) : undefined;
        const drv = row.trip.driverId ? tripDriverMap.get(row.trip.driverId) : undefined;
        const existingTrip = dateEntry.tripsMap.get(row.trip.id);
        if (existingTrip) {
          existingTrip.passengerCount++;
        } else {
          dateEntry.tripsMap.set(row.trip.id, {
            tripId: row.trip.id,
            tripCode: row.trip.tripCode,
            status: row.trip.status,
            plannedStartAt: row.trip.plannedStartAt ? row.trip.plannedStartAt.toISOString() : null,
            driverId: row.trip.driverId,
            driverName: drv?.fullName ?? null,
            driverCode: drv?.driverCode ?? null,
            vehicleId: row.trip.vehicleId,
            vehicleRegistrationNo: veh?.registrationNo ?? null,
            vehicleType: veh?.vehicleType ?? null,
            effectiveCapacity: veh
              ? resolveEffectiveVehicleCapacity(veh.vehicleType, veh.seatingCapacity)
              : null,
            passengerCount: 1,
          });
        }
      }

      dateMap.set(row.booking.travelDate, dateEntry);
    }

    let peakDatePassengers = 0;
    const dates = [...dateMap.values()]
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate))
      .map((d) => {
        const activeCount = d.bookings.filter(
          (b) => !['CANCELLED', 'REJECTED', 'EXPIRED'].includes(b.status),
        ).length;
        if (activeCount > peakDatePassengers) peakDatePassengers = activeCount;

        const hasInfeasible = d.bookings.some(
          (b) =>
            b.isArriveByInfeasible &&
            (b.status === 'PENDING_APPROVAL' || b.status === 'APPROVED'),
        );
        const hasPending = d.bookings.some((b) => b.status === 'PENDING_APPROVAL');
        const hasUnallocatedApproved = d.bookings.some(
          (b) => b.status === 'APPROVED' && !b.tripId,
        );
        const tripsArr = [...d.tripsMap.values()];

        let dateStatus:
          | 'PENDING_APPROVAL'
          | 'NEEDS_ALLOCATION'
          | 'CONFLICT'
          | 'DISPATCHED'
          | 'IN_PROGRESS'
          | 'COMPLETED'
          | 'CANCELLED'
          | 'EXPIRED' = 'DISPATCHED';

        if (hasInfeasible) dateStatus = 'CONFLICT';
        else if (hasPending) dateStatus = 'PENDING_APPROVAL';
        else if (hasUnallocatedApproved) dateStatus = 'NEEDS_ALLOCATION';
        else if (tripsArr.some((t) => t.status === 'IN_PROGRESS')) dateStatus = 'IN_PROGRESS';
        else if (tripsArr.length > 0 && tripsArr.every((t) => t.status === 'COMPLETED')) {
          dateStatus = 'COMPLETED';
        } else if (tripsArr.length > 0) {
          dateStatus = 'DISPATCHED';
        } else if (d.bookings.every((b) => b.status === 'EXPIRED')) {
          dateStatus = 'EXPIRED';
        } else {
          dateStatus = 'CANCELLED';
        }

        return {
          travelDate: d.travelDate,
          dayOfWeek: getDayOfWeekForIsoDate(d.travelDate),
          dateStatus,
          bookings: d.bookings,
          trips: tripsArr,
        };
      });

    // Audit history scoped ONLY to bookings, series, or trips inside this commute
    const auditConditions = [
      and(eq(auditLogs.entityType, 'booking'), inArray(auditLogs.entityId, allBookingIds)),
    ];
    if (allSeriesIds.size > 0) {
      auditConditions.push(
        and(eq(auditLogs.entityType, 'booking_series'), inArray(auditLogs.entityId, [...allSeriesIds])),
      );
    }
    if (tripIds.length > 0) {
      auditConditions.push(
        and(eq(auditLogs.entityType, 'trip'), inArray(auditLogs.entityId, tripIds)),
      );
    }

    const scopedAuditRows = await this.dbService.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorRole: auditLogs.actorRole,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, organizationId), or(...auditConditions)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(40);

    const targetLocalityId = first.location.localityId ?? first.series?.localityId ?? null;
    const driverSuggestions = orgDrivers
      .filter((d) => !d.driver.isSuspended)
      .map((d) => {
        const effCap = d.vehicle
          ? resolveEffectiveVehicleCapacity(d.vehicle.vehicleType, d.vehicle.seatingCapacity)
          : null;
        return {
          driverId: d.driver.id,
          driverCode: d.driver.driverCode,
          fullName: d.user.fullName,
          availabilityStatus: d.driver.availabilityStatus,
          baseLocalityId: d.driver.baseLocalityId,
          baseLocalityName: d.locality?.canonicalName ?? d.driver.baseLocalityName ?? 'Unassigned',
          isLocalityMatch: Boolean(targetLocalityId && d.driver.baseLocalityId === targetLocalityId),
          vehicleId: d.vehicle?.id ?? null,
          vehicleRegistrationNo: d.vehicle?.registrationNo ?? null,
          vehicleModelName: d.vehicle?.modelName ?? null,
          vehicleType: d.vehicle?.vehicleType ?? null,
          effectiveCapacity: effCap,
        };
      })
      .sort((a, b) => Number(b.isLocalityMatch) - Number(a.isLocalityMatch));

    const recurrenceValues = [...recurrenceSet];
    const startDate = dates[0]?.travelDate ?? first.booking.travelDate;
    const endDate = dates[dates.length - 1]?.travelDate ?? first.booking.travelDate;

    return {
      commute: {
        commuteKey,
        commuteName: commuteMeta.commuteName,
        direction: first.booking.direction,
        localityId: targetLocalityId,
        localityName: localityLabel,
        officeId: first.office.id,
        officeName: first.office.name,
        shiftId: first.shift.id,
        shiftName: first.shift.name,
        shiftTimeLocal: first.shift.shiftTimeLocal,
        timePreference: first.booking.timePreference,
        requestedTimeLocal: commuteMeta.requestedTimeLocal,
        timezone: first.booking.timezone,
        recurrenceSummary: recurrenceValues.length === 1 ? recurrenceValues[0] : 'MIXED',
        selectedDaysOfWeek: [...weekdaySet][0] ?? null,
        startDate,
        endDate,
        scheduledDatesCount: dates.length,
        employeeCount: employeeMap.size,
        counts,
      },
      employees: [...employeeMap.values()],
      vehicleRequirements: {
        peakDatePassengers,
        recommendedSedans: Math.max(1, Math.ceil(peakDatePassengers / 4)),
        recommendedSuvs: Math.max(1, Math.ceil(peakDatePassengers / 6)),
        maxSedanSeats: 4,
        maxSuvSeats: 6,
      },
      driverSuggestions,
      dates,
      auditHistory: scopedAuditRows.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async approveCommuteDates(
    identity: RequestIdentity,
    commuteKey: string,
    dto: ApproveCommuteDatesDto,
  ) {
    const conditions = [
      eq(bookings.organizationId, identity.organizationId),
      eq(bookings.commuteKey, commuteKey),
      eq(bookings.status, 'PENDING_APPROVAL'),
    ];
    if (dto.dates && dto.dates.length > 0) {
      conditions.push(inArray(bookings.travelDate, dto.dates));
    }
    if (dto.bookingIds && dto.bookingIds.length > 0) {
      conditions.push(inArray(bookings.id, dto.bookingIds));
    }
    if (dto.skipInfeasible && dto.decision === 'APPROVED') {
      conditions.push(eq(bookings.isArriveByInfeasible, false));
    }

    const targets = await this.dbService.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(...conditions));

    if (targets.length === 0) {
      throw new BadRequestException({
        code: 'NO_ELIGIBLE_BOOKINGS',
        message: 'No pending bookings in this commute matched your approval selection.',
      });
    }

    return this.approvalsService.bulkDecide(identity, {
      bookingIds: targets.map((t) => t.id),
      decision: dto.decision,
      remarks: dto.remarks,
    });
  }

  async allocateCommuteDates(
    identity: RequestIdentity,
    commuteKey: string,
    dto: AllocateCommuteDatesDto,
  ) {
    if (dto.publish) {
      if (dto.groups && dto.groups.length > 0) {
        return this.autoAllocation.publishAllocation(identity, {
          runId: dto.runId,
          groups: dto.groups,
        });
      }
      const plan = await this.autoAllocation.generatePlan(identity, {
        commuteKey,
        travelDate: dto.date,
        persistRun: true,
      });
      if (plan.proposals.length === 0) {
        throw new BadRequestException({
          code: 'NO_ALLOCATION_PROPOSALS',
          message:
            'No feasible driver/vehicle allocation proposals are ready to publish for this commute.',
        });
      }
      return this.autoAllocation.publishAllocation(identity, {
        runId: plan.runId ?? undefined,
        groups: plan.proposals.map((p) => ({
          clusterId: p.clusterId,
          travelDate: p.travelDate,
          shiftId: p.shiftId,
          officeId: p.officeId,
          direction: p.direction,
          driverId: p.suggestedDriver.id,
          vehicleId: p.suggestedVehicle.id,
          plannedStartAt: p.plannedStartAt,
          plannedEndAt: p.plannedEndAt,
          primaryLocalityId: p.primaryLocalityId,
          rationale: p.rationale,
          stops: p.stops.map((s) => ({
            bookingId: s.bookingId,
            sequenceNo: s.sequenceNo,
            scheduledArrivalAt: s.scheduledArrivalAt,
          })),
        })),
      });
    }

    return this.autoAllocation.generatePlan(identity, {
      commuteKey,
      travelDate: dto.date,
      persistRun: dto.persistRun,
    });
  }

  private async _loadDriverActiveTrips(organizationId: string, driverId: string) {
    const tripRows = await this.dbService.db
      .select({
        id: trips.id,
        tripCode: trips.tripCode,
        travelDate: trips.travelDate,
        direction: trips.direction,
        status: trips.status,
        currentStopSequence: trips.currentStopSequence,
        plannedStartAt: trips.plannedStartAt,
        plannedEndAt: trips.plannedEndAt,
        actualStartAt: trips.actualStartAt,
        completedAt: trips.completedAt,
        officeId: offices.id,
        officeName: offices.name,
        shiftId: shifts.id,
        shiftName: shifts.name,
        shiftTimeLocal: shifts.shiftTimeLocal,
        primaryLocalityId: trips.primaryLocalityId,
        commuteKey: trips.commuteKey,
        commuteName: trips.commuteName,
        localityCanonicalName: localities.canonicalName,
        vehicleRegistrationNo: vehicles.registrationNo,
        vehicleModelName: vehicles.modelName,
      })
      .from(trips)
      .innerJoin(offices, eq(trips.officeId, offices.id))
      .innerJoin(shifts, eq(trips.shiftId, shifts.id))
      .leftJoin(localities, eq(trips.primaryLocalityId, localities.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .where(
        and(
          eq(trips.organizationId, organizationId),
          eq(trips.driverId, driverId),
          notInArray(trips.status, ['CANCELLED', 'ABORTED']),
        ),
      )
      .orderBy(asc(trips.travelDate), asc(trips.plannedStartAt));

    if (tripRows.length === 0) return [];

    const tripIds = tripRows.map((t) => t.id);
    const [stopCounts, assignmentRows] = await Promise.all([
      this.dbService.db
        .select({
          tripId: tripStops.tripId,
          count: sql<number>`count(*)::int`,
        })
        .from(tripStops)
        .where(inArray(tripStops.tripId, tripIds))
        .groupBy(tripStops.tripId),
      this.dbService.db
        .select({
          tripId: passengerAssignments.tripId,
          status: passengerAssignments.status,
          timePreference: bookings.timePreference,
          requestedTimeLocal: bookings.requestedTimeLocal,
          normalizedLocality: employeeLocations.normalizedLocality,
          corridorTag: employeeLocations.corridorTag,
          locationName: employeeLocations.locationName,
        })
        .from(passengerAssignments)
        .innerJoin(bookings, eq(passengerAssignments.bookingId, bookings.id))
        .innerJoin(employeeLocations, eq(bookings.pickupLocationId, employeeLocations.id))
        .where(inArray(passengerAssignments.tripId, tripIds)),
    ]);

    const stopCountMap = new Map(stopCounts.map((s) => [s.tripId, s.count]));
    const assignByTrip = new Map<string, typeof assignmentRows>();
    for (const a of assignmentRows) {
      const list = assignByTrip.get(a.tripId) ?? [];
      list.push(a);
      assignByTrip.set(a.tripId, list);
    }

    const result: Array<{
      id: string;
      tripCode: string;
      travelDate: string;
      direction: 'LOGIN' | 'LOGOUT';
      status: string;
      currentStopSequence: number;
      plannedStartAt: Date | null;
      actualStartAt: Date | null;
      completedAt: Date | null;
      officeName: string;
      shiftName: string;
      shiftTimeLocal: string;
      vehicleRegistrationNo: string | null;
      vehicleModelName: string | null;
      stopsCount: number;
      passengersCount: number;
      pendingPassengersCount: number;
      commuteId: string;
      commuteName: string;
      localityName: string;
      timePreferenceSummary: string;
    }> = [];

    for (const t of tripRows) {
      const assigns = assignByTrip.get(t.id) ?? [];
      const activeAssigns = assigns.filter(
        (a) => !['CANCELLED', 'SKIPPED', 'DROPPED'].includes(a.status),
      );
      // Skip dates where all passenger assignments were cancelled/dropped
      if (assigns.length > 0 && activeAssigns.length === 0) continue;

      const sampleLoc = activeAssigns[0] ?? assigns[0];
      const localityLabel = resolveLocalityDisplayLabel({
        localityName: t.localityCanonicalName,
        normalizedLocality: sampleLoc?.normalizedLocality,
        corridorTag: sampleLoc?.corridorTag,
        locationName: sampleLoc?.locationName,
      });
      const built = buildDriverCommuteIdentity({
        officeId: t.officeId,
        officeName: t.officeName,
        shiftId: t.shiftId,
        shiftName: t.shiftName,
        shiftTimeLocal: t.shiftTimeLocal,
        direction: t.direction,
        localityLabel,
      });

      const pref = sampleLoc?.timePreference ?? 'PICKUP_AT';
      const timeStr = sampleLoc?.requestedTimeLocal ?? t.shiftTimeLocal;
      const timePreferenceSummary =
        pref === 'ARRIVE_BY'
          ? `Arrive by ${formatReadableTime12h(timeStr)}`
          : `Pickup ~${formatReadableTime12h(timeStr)}`;

      result.push({
        id: t.id,
        tripCode: t.tripCode,
        travelDate: t.travelDate,
        direction: t.direction,
        status: t.status,
        currentStopSequence: t.currentStopSequence,
        plannedStartAt: t.plannedStartAt,
        actualStartAt: t.actualStartAt,
        completedAt: t.completedAt,
        officeName: t.officeName,
        shiftName: t.shiftName,
        shiftTimeLocal: t.shiftTimeLocal,
        vehicleRegistrationNo: t.vehicleRegistrationNo,
        vehicleModelName: t.vehicleModelName,
        stopsCount: stopCountMap.get(t.id) ?? 0,
        passengersCount: activeAssigns.length,
        pendingPassengersCount: activeAssigns.filter((a) => isPassengerPendingForRouting(a.status))
          .length,
        commuteId: t.commuteKey ?? built.commuteKey,
        commuteName: t.commuteName ?? built.commuteName,
        localityName: localityLabel,
        timePreferenceSummary,
      });
    }

    return result;
  }

  async getDriverCommutesOverview(identity: RequestIdentity) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    const [orgRow] = await this.dbService.db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, identity.organizationId))
      .limit(1);
    const tz = orgRow?.timezone || 'Asia/Kolkata';
    const todayDate = formatIsoDateInTimezone(new Date(), tz);

    const allTrips = await this._loadDriverActiveTrips(identity.organizationId, driver.id);

    // Today's Target: live active IN_PROGRESS duty plus all trips scheduled for today's date
    const todayTargets = allTrips
      .filter((t) => t.status === 'IN_PROGRESS' || t.travelDate === todayDate)
      .sort((a, b) => {
        if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
        if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
        return a.travelDate.localeCompare(b.travelDate);
      })
      .map((t) => ({
        id: t.id,
        tripCode: t.tripCode,
        travelDate: t.travelDate,
        direction: t.direction,
        status: t.status,
        currentStopSequence: t.currentStopSequence,
        plannedStartAt: t.plannedStartAt ? t.plannedStartAt.toISOString() : null,
        actualStartAt: t.actualStartAt ? t.actualStartAt.toISOString() : null,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        officeName: t.officeName,
        shiftName: t.shiftName,
        shiftTimeLocal: t.shiftTimeLocal,
        vehicleRegistrationNo: t.vehicleRegistrationNo,
        vehicleModelName: t.vehicleModelName,
        stopsCount: t.stopsCount,
        passengersCount: t.passengersCount,
        pendingPassengersCount: t.pendingPassengersCount,
        commuteId: t.commuteId,
        commuteName: t.commuteName,
        localityName: t.localityName,
      }));

    const commuteMap = new Map<
      string,
      {
        commuteId: string;
        commuteName: string;
        direction: 'LOGIN' | 'LOGOUT';
        officeName: string;
        shiftName: string;
        shiftTimeLocal: string;
        localityName: string;
        timePreferenceSummary: string;
        trips: typeof allTrips;
      }
    >();

    for (const t of allTrips) {
      const existing = commuteMap.get(t.commuteId);
      if (existing) {
        existing.trips.push(t);
      } else {
        commuteMap.set(t.commuteId, {
          commuteId: t.commuteId,
          commuteName: t.commuteName,
          direction: t.direction,
          officeName: t.officeName,
          shiftName: t.shiftName,
          shiftTimeLocal: t.shiftTimeLocal,
          localityName: t.localityName,
          timePreferenceSummary: t.timePreferenceSummary,
          trips: [t],
        });
      }
    }

    const commutes = [...commuteMap.values()]
      .map((c) => {
        const sortedTrips = [...c.trips].sort((a, b) => a.travelDate.localeCompare(b.travelDate));
        const upcomingOrActive = sortedTrips.filter((t) =>
          ['CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS'].includes(t.status),
        );
        const primarySet = upcomingOrActive.length > 0 ? upcomingOrActive : sortedTrips;
        const nextTrip =
          upcomingOrActive.find((t) => t.status === 'IN_PROGRESS') ??
          upcomingOrActive[0] ??
          sortedTrips[sortedTrips.length - 1];

        return {
          commuteId: c.commuteId,
          commuteName: c.commuteName,
          direction: c.direction,
          officeName: c.officeName,
          shiftName: c.shiftName,
          shiftTimeLocal: c.shiftTimeLocal,
          localityName: c.localityName,
          timePreferenceSummary: c.timePreferenceSummary,
          startDate: primarySet[0].travelDate,
          endDate: primarySet[primarySet.length - 1].travelDate,
          scheduledTripsCount: upcomingOrActive.length,
          totalAssignedTripsCount: sortedTrips.length,
          completedTripsCount: sortedTrips.filter((t) => t.status === 'COMPLETED').length,
          hasInProgressTrip: upcomingOrActive.some((t) => t.status === 'IN_PROGRESS'),
          nextTripId: nextTrip.id,
          nextTripCode: nextTrip.tripCode,
          nextTripDate: nextTrip.travelDate,
          nextTripStatus: nextTrip.status,
          nextTripStartAt: nextTrip.plannedStartAt ? nextTrip.plannedStartAt.toISOString() : null,
          nextTripStopsCount: nextTrip.stopsCount,
          nextTripPassengersCount: nextTrip.passengersCount,
        };
      })
      .sort((a, b) => {
        if (a.hasInProgressTrip !== b.hasInProgressTrip) return a.hasInProgressTrip ? -1 : 1;
        if ((a.scheduledTripsCount > 0) !== (b.scheduledTripsCount > 0)) {
          return a.scheduledTripsCount > 0 ? -1 : 1;
        }
        return a.nextTripDate.localeCompare(b.nextTripDate);
      });

    return {
      todayDate,
      todayTargets,
      commutes,
    };
  }

  async getDriverCommuteCalendar(
    identity: RequestIdentity,
    commuteId: string,
    query: DriverCalendarQuery,
  ) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    const [orgRow] = await this.dbService.db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, identity.organizationId))
      .limit(1);
    const tz = orgRow?.timezone || 'Asia/Kolkata';
    const todayDate = formatIsoDateInTimezone(new Date(), tz);

    const allTrips = (await this._loadDriverActiveTrips(identity.organizationId, driver.id)).filter(
      (t) => t.commuteId === commuteId,
    );

    if (allTrips.length === 0) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Assigned commute ${commuteId} not found for authenticated driver.`,
      });
    }

    const activeMonths = [...new Set(allTrips.map((t) => t.travelDate.slice(0, 7)))].sort();
    const currentMonth = todayDate.slice(0, 7);
    const upcomingOrActive = allTrips.find((t) => t.status !== 'COMPLETED');
    const targetMonth =
      query.month ??
      (activeMonths.includes(currentMonth)
        ? currentMonth
        : (upcomingOrActive?.travelDate.slice(0, 7) ?? activeMonths[activeMonths.length - 1]));

    const monthTrips = allTrips.filter((t) => t.travelDate.startsWith(targetMonth));
    const dateGroups = new Map<string, typeof monthTrips>();
    for (const t of monthTrips) {
      const list = dateGroups.get(t.travelDate) ?? [];
      list.push(t);
      dateGroups.set(t.travelDate, list);
    }

    const scheduledDates = [...dateGroups.entries()]
      .sort(([d1], [d2]) => d1.localeCompare(d2))
      .map(([date, list]) => {
        const primary = list.find((t) => t.status === 'IN_PROGRESS') ?? list[0];
        return {
          date,
          tripCount: list.length,
          statuses: list.map((t) => t.status),
          primaryTripId: primary.id,
          primaryTripCode: primary.tripCode,
          plannedStartAt: primary.plannedStartAt ? primary.plannedStartAt.toISOString() : null,
          plannedStartTimeLocal: primary.plannedStartAt
            ? formatTimeLocalInTimezone(primary.plannedStartAt, tz)
            : primary.shiftTimeLocal,
          passengerCount: list.reduce((sum, t) => sum + t.passengersCount, 0),
          stopsCount: primary.stopsCount,
        };
      });

    const sample = allTrips[0];
    return {
      commute: {
        commuteId: sample.commuteId,
        commuteName: sample.commuteName,
        direction: sample.direction,
        officeName: sample.officeName,
        shiftName: sample.shiftName,
        shiftTimeLocal: sample.shiftTimeLocal,
        localityName: sample.localityName,
        timePreferenceSummary: sample.timePreferenceSummary,
        startDate: allTrips[0].travelDate,
        endDate: allTrips[allTrips.length - 1].travelDate,
        totalAssignedTripsCount: allTrips.length,
      },
      month: targetMonth,
      todayDate,
      activeMonths,
      scheduledDates,
    };
  }

  async getDriverCommuteDateManifest(
    identity: RequestIdentity,
    commuteId: string,
    travelDate: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'date parameter must be YYYY-MM-DD.',
      });
    }

    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );
    const matching = (
      await this._loadDriverActiveTrips(identity.organizationId, driver.id)
    ).filter((t) => t.commuteId === commuteId && t.travelDate === travelDate);

    const manifests = await Promise.all(
      matching.map((t) => this.driverExecution.getDriverTripManifest(identity, t.id)),
    );

    return {
      date: travelDate,
      commuteId,
      trips: manifests,
    };
  }
}
