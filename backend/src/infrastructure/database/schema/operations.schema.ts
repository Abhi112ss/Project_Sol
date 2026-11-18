import {
  boolean,
  date,
  doublePrecision,
  geometry,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { localities, offices, organizations, shifts, users, vendors } from './core-org.schema.js';
import {
  approvalDecisionEnum,
  bookingRecurrenceTypeEnum,
  bookingSeriesStatusEnum,
  bookingStatusEnum,
  bookingTimePreferenceEnum,
  noShowAppealStatusEnum,
  noShowReasonEnum,
  noShowSyncStatusEnum,
  passengerAssignmentStatusEnum,
  stopStatusEnum,
  stopTypeEnum,
  tripDirectionEnum,
  tripStatusEnum,
} from './enums.js';
import { drivers, employeeLocations, employees, vehicles } from './fleet-people.schema.js';

export const bookingSeries = pgTable(
  'booking_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'restrict' }),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    pickupLocationId: uuid('pickup_location_id')
      .notNull()
      .references(() => employeeLocations.id, { onDelete: 'restrict' }),
    localityId: uuid('locality_id').references(() => localities.id, { onDelete: 'set null' }),
    commuteKey: varchar('commute_key', { length: 160 }),
    commuteName: varchar('commute_name', { length: 160 }),
    direction: tripDirectionEnum('direction').notNull(),
    timePreference: bookingTimePreferenceEnum('time_preference').notNull().default('PICKUP_AT'),
    requestedTimeLocal: varchar('requested_time_local', { length: 5 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    recurrenceType: bookingRecurrenceTypeEnum('recurrence_type').notNull().default('ONE_DAY'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    selectedDaysOfWeek: varchar('selected_days_of_week', { length: 64 })
      .notNull()
      .default('MON,TUE,WED,THU,FRI'),
    status: bookingSeriesStatusEnum('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('booking_series_org_emp_status_idx').on(
      table.organizationId,
      table.employeeId,
      table.status,
    ),
    index('booking_series_status_end_idx').on(table.status, table.endDate),
    index('booking_series_org_commute_idx').on(table.organizationId, table.commuteKey),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => bookingSeries.id, { onDelete: 'set null' }),
    commuteKey: varchar('commute_key', { length: 160 }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'restrict' }),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    pickupLocationId: uuid('pickup_location_id')
      .notNull()
      .references(() => employeeLocations.id, { onDelete: 'restrict' }),
    travelDate: date('travel_date').notNull(),
    direction: tripDirectionEnum('direction').notNull(),
    timePreference: bookingTimePreferenceEnum('time_preference').notNull().default('PICKUP_AT'),
    requestedTimeLocal: varchar('requested_time_local', { length: 5 }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    requestedPickupAt: timestamp('requested_pickup_at', { withTimezone: true }),
    scheduledPickupAt: timestamp('scheduled_pickup_at', { withTimezone: true }).notNull(),
    isArriveByInfeasible: boolean('is_arrive_by_infeasible').notNull().default(false),
    feasibilityNote: text('feasibility_note'),
    status: bookingStatusEnum('status').notNull().default('PENDING_APPROVAL'),
    notes: text('notes'),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('bookings_org_date_status_idx').on(table.organizationId, table.travelDate, table.status),
    index('bookings_emp_date_idx').on(table.employeeId, table.travelDate),
    index('bookings_org_commute_date_idx').on(
      table.organizationId,
      table.commuteKey,
      table.travelDate,
    ),
    index('bookings_series_idx').on(table.seriesId),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    approverUserId: uuid('approver_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    decision: approvalDecisionEnum('decision').notNull(),
    remarks: text('remarks'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('approvals_org_booking_idx').on(table.organizationId, table.bookingId)],
);

export const allocationRuns = pgTable(
  'allocation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    travelDate: date('travel_date'),
    shiftId: uuid('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    officeId: uuid('office_id').references(() => offices.id, { onDelete: 'set null' }),
    direction: tripDirectionEnum('direction'),
    engineVersion: varchar('engine_version', { length: 64 })
      .notNull()
      .default('LOCALITY_INTERVAL_V1'),
    configSnapshotJson: jsonb('config_snapshot_json').$type<Record<string, unknown>>().notNull(),
    summaryJson: jsonb('summary_json').$type<Record<string, unknown>>().notNull(),
    proposalsJson: jsonb('proposals_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('allocation_runs_org_date_idx').on(table.organizationId, table.travelDate, table.createdAt),
  ],
);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'restrict' }),
    driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    primaryLocalityId: uuid('primary_locality_id').references(() => localities.id, {
      onDelete: 'set null',
    }),
    commuteKey: varchar('commute_key', { length: 160 }),
    commuteName: varchar('commute_name', { length: 160 }),
    allocationRunId: uuid('allocation_run_id').references(() => allocationRuns.id, {
      onDelete: 'set null',
    }),
    allocationRationaleJson: jsonb('allocation_rationale_json').$type<Record<
      string,
      unknown
    > | null>(),
    tripCode: varchar('trip_code', { length: 48 }).notNull(),
    travelDate: date('travel_date').notNull(),
    direction: tripDirectionEnum('direction').notNull(),
    status: tripStatusEnum('status').notNull().default('CREATED'),
    currentStopSequence: integer('current_stop_sequence').notNull().default(1),
    plannedStartAt: timestamp('planned_start_at', { withTimezone: true }),
    plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    abortedAt: timestamp('aborted_at', { withTimezone: true }),
    abortReason: text('abort_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('trips_org_code_uidx').on(table.organizationId, table.tripCode),
    index('trips_org_date_status_idx').on(table.organizationId, table.travelDate, table.status),
    index('trips_driver_status_idx').on(table.driverId, table.status),
    index('trips_org_drv_commute_date_idx').on(
      table.organizationId,
      table.driverId,
      table.commuteKey,
      table.travelDate,
    ),
  ],
);

export const tripStops = pgTable(
  'trip_stops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    sequenceNo: integer('sequence_no').notNull(),
    stopType: stopTypeEnum('stop_type').notNull(),
    locationName: varchar('location_name', { length: 160 }).notNull(),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    geofenceRadiusM: integer('geofence_radius_m').notNull().default(150),
    scheduledArrivalAt: timestamp('scheduled_arrival_at', { withTimezone: true }),
    actualArrivalAt: timestamp('actual_arrival_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: stopStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('trip_stops_trip_seq_uidx').on(table.tripId, table.sequenceNo),
    index('trip_stops_gist_idx').using('gist', table.location),
  ],
);

export const passengerAssignments = pgTable(
  'passenger_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tripStopId: uuid('trip_stop_id')
      .notNull()
      .references(() => tripStops.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    status: passengerAssignmentStatusEnum('status').notNull().default('SCHEDULED'),
    scheduledPickupAt: timestamp('scheduled_pickup_at', { withTimezone: true }),
    driverArrivedAt: timestamp('driver_arrived_at', { withTimezone: true }),
    boardedAt: timestamp('boarded_at', { withTimezone: true }),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    arrivalDelaySeconds: integer('arrival_delay_seconds'),
    passengerWaitSeconds: integer('passenger_wait_seconds'),
    runningLateEtaMinutes: integer('running_late_eta_minutes'),
    runningLateReportedAt: timestamp('running_late_reported_at', { withTimezone: true }),
    safeReachConfirmedAt: timestamp('safe_reach_confirmed_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('pass_assign_booking_uidx').on(table.bookingId),
    index('pass_assign_trip_status_idx').on(table.tripId, table.status),
    index('pass_assign_emp_status_idx').on(table.employeeId, table.status),
  ],
);

export const tripEvents = pgTable(
  'trip_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tripStopId: uuid('trip_stop_id').references(() => tripStops.id, { onDelete: 'set null' }),
    passengerAssignmentId: uuid('passenger_assignment_id').references(
      () => passengerAssignments.id,
      { onDelete: 'set null' },
    ),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 48 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    clientEventId: uuid('client_event_id').notNull(),
    occurredAtClient: timestamp('occurred_at_client', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).defaultNow().notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    gpsAccuracyM: doublePrecision('gps_accuracy_m'),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex('trip_events_org_client_evt_uidx').on(table.organizationId, table.clientEventId),
    index('trip_events_trip_received_idx').on(table.tripId, table.serverReceivedAt),
  ],
);

export const gpsLocations = pgTable(
  'gps_locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => drivers.id, { onDelete: 'cascade' }),
    clientPingId: uuid('client_ping_id').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    accuracyM: doublePrecision('accuracy_m'),
    speedMps: doublePrecision('speed_mps'),
    headingDeg: doublePrecision('heading_deg'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('gps_loc_trip_ping_uidx').on(table.tripId, table.clientPingId),
    index('gps_loc_trip_recorded_idx').on(table.tripId, table.recordedAt),
    index('gps_loc_gist_idx').using('gist', table.location),
  ],
);

export const noShowRecords = pgTable(
  'no_show_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tripStopId: uuid('trip_stop_id')
      .notNull()
      .references(() => tripStops.id, { onDelete: 'cascade' }),
    passengerAssignmentId: uuid('passenger_assignment_id')
      .notNull()
      .references(() => passengerAssignments.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => drivers.id, { onDelete: 'restrict' }),
    reasonCode: noShowReasonEnum('reason_code').notNull(),
    driverNotes: text('driver_notes'),
    driverArrivedAt: timestamp('driver_arrived_at', { withTimezone: true }).notNull(),
    waitStartedAt: timestamp('wait_started_at', { withTimezone: true }).notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull(),
    waitedSeconds: integer('waited_seconds').notNull(),
    distanceFromStopM: doublePrecision('distance_from_stop_m'),
    geofenceVerified: boolean('geofence_verified').notNull().default(false),
    gpsAccuracyM: doublePrecision('gps_accuracy_m'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    syncStatus: noShowSyncStatusEnum('sync_status').notNull().default('VERIFIED'),
    appealStatus: noShowAppealStatusEnum('appeal_status').notNull().default('NONE'),
    appealNote: text('appeal_note'),
    appealResolvedBy: uuid('appeal_resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    appealResolutionNote: text('appeal_resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('no_show_pass_assign_uidx').on(table.passengerAssignmentId),
    index('no_show_org_appeal_idx').on(table.organizationId, table.appealStatus),
  ],
);

