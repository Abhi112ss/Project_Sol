import {
  boolean,
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
import { orgStatusEnum, tripDirectionEnum, userRoleEnum } from './enums.js';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    status: orgStatusEnum('status').notNull().default('ACTIVE'),
    countryCode: varchar('country_code', { length: 8 }).notNull().default('IN'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('organizations_slug_uidx').on(table.slug)],
);

export const organizationSettings = pgTable(
  'organization_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    defaultGeofenceRadiusM: integer('default_geofence_radius_m').notNull().default(150),
    noShowWaitSeconds: integer('no_show_wait_seconds').notNull().default(300),
    bookingCutoffMinutes: integer('booking_cutoff_minutes').notNull().default(120),
    cancellationCutoffMinutes: integer('cancellation_cutoff_minutes').notNull().default(45),
    requireBoardingOtp: boolean('require_boarding_otp').notNull().default(true),
    requireDeboardingOtp: boolean('require_deboarding_otp').notNull().default(false),
    gpsStaleThresholdSeconds: integer('gps_stale_threshold_seconds').notNull().default(60),
    gpsRetentionDays: integer('gps_retention_days').notNull().default(90),
    gpsPingIntervalSeconds: integer('gps_ping_interval_seconds').notNull().default(15),
    nearbyLocalityRadiusM: integer('nearby_locality_radius_m').notNull().default(4000),
    maxRouteDetourRatio: doublePrecision('max_route_detour_ratio').notNull().default(1.75),
    pickupWindowToleranceMinutes: integer('pickup_window_tolerance_minutes').notNull().default(15),
    driverTurnaroundBufferMinutes: integer('driver_turnaround_buffer_minutes').notNull().default(20),
    arriveBySafetyBufferMinutes: integer('arrive_by_safety_buffer_minutes').notNull().default(10),
    allowSameDayBooking: boolean('allow_same_day_booking').notNull().default(false),
    currencyCode: varchar('currency_code', { length: 8 }).notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('org_settings_org_id_uidx').on(table.organizationId)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 180 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull(),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    passwordHash: text('password_hash'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_uidx').on(table.email)],
);

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 48 }).notNull(),
    contactName: varchar('contact_name', { length: 120 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 32 }).notNull(),
    billingBaseTripPaise: integer('billing_base_trip_paise').notNull().default(45000),
    billingRatePerKmPaise: integer('billing_rate_per_km_paise').notNull().default(1800),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('vendors_org_code_uidx').on(table.organizationId, table.code)],
);

export const offices = pgTable(
  'offices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 48 }).notNull(),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    geofenceRadiusM: integer('geofence_radius_m').notNull().default(250),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('offices_org_code_uidx').on(table.organizationId, table.code),
    index('offices_location_gist_idx').using('gist', table.location),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    officeId: uuid('office_id').references(() => offices.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memberships_org_user_role_uidx').on(
      table.organizationId,
      table.userId,
      table.role,
    ),
    index('memberships_user_idx').on(table.userId),
  ],
);

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    code: varchar('code', { length: 48 }).notNull(),
    direction: tripDirectionEnum('direction').notNull(),
    shiftTimeLocal: varchar('shift_time_local', { length: 5 }).notNull(),
    daysOfWeek: varchar('days_of_week', { length: 32 }).notNull().default('MON,TUE,WED,THU,FRI'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('shifts_org_office_code_uidx').on(table.organizationId, table.officeId, table.code),
  ],
);

export const localities = pgTable(
  'localities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    canonicalName: varchar('canonical_name', { length: 120 }).notNull(),
    normalizedSlug: varchar('normalized_slug', { length: 120 }).notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    centerLatitude: doublePrecision('center_latitude').notNull(),
    centerLongitude: doublePrecision('center_longitude').notNull(),
    centerPoint: geometry('center_point', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    proximityRadiusM: integer('proximity_radius_m').notNull().default(3500),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('localities_org_slug_uidx').on(table.organizationId, table.normalizedSlug),
    index('localities_center_gist_idx').using('gist', table.centerPoint),
  ],
);

