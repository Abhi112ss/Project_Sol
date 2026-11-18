import {
  boolean,
  doublePrecision,
  geometry,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { localities, offices, organizations, shifts, users, vendors } from './core-org.schema.js';
import { availabilityStatusEnum, vehicleTypeEnum } from './enums.js';

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'restrict' }),
    defaultShiftId: uuid('default_shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    employeeCode: varchar('employee_code', { length: 48 }).notNull(),
    department: varchar('department', { length: 100 }).notNull(),
    transportEligible: boolean('transport_eligible').notNull().default(true),
    emergencyContactName: varchar('emergency_contact_name', { length: 120 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('employees_org_code_uidx').on(table.organizationId, table.employeeCode),
    uniqueIndex('employees_org_user_uidx').on(table.organizationId, table.userId),
    index('employees_org_dept_idx').on(table.organizationId, table.department),
  ],
);

export const employeeLocations = pgTable(
  'employee_locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    locationName: varchar('location_name', { length: 120 }).notNull(),
    address: text('address').notNull(),
    corridorTag: varchar('corridor_tag', { length: 80 }),
    localityId: uuid('locality_id').references(() => localities.id, { onDelete: 'set null' }),
    normalizedLocality: varchar('normalized_locality', { length: 120 }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    googlePlaceId: varchar('google_place_id', { length: 180 }),
    originalMapsUrl: text('original_maps_url'),
    geofenceRadiusM: integer('geofence_radius_m').notNull().default(150),
    isDefault: boolean('is_default').notNull().default(false),
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('emp_loc_org_emp_idx').on(table.organizationId, table.employeeId),
    index('emp_loc_gist_idx').using('gist', table.location),
  ],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    registrationNo: varchar('registration_no', { length: 32 }).notNull(),
    modelName: varchar('model_name', { length: 100 }).notNull(),
    vehicleType: vehicleTypeEnum('vehicle_type').notNull().default('SEDAN'),
    seatingCapacity: integer('seating_capacity').notNull().default(4),
    availabilityStatus: availabilityStatusEnum('availability_status')
      .notNull()
      .default('AVAILABLE'),
    insuranceExpiresAt: timestamp('insurance_expires_at', { withTimezone: true }),
    permitExpiresAt: timestamp('permit_expires_at', { withTimezone: true }),
    fitnessExpiresAt: timestamp('fitness_expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('vehicles_org_reg_uidx').on(table.organizationId, table.registrationNo),
    index('vehicles_org_status_idx').on(table.organizationId, table.availabilityStatus),
  ],
);

export const drivers = pgTable(
  'drivers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    assignedVehicleId: uuid('assigned_vehicle_id').references(() => vehicles.id, {
      onDelete: 'set null',
    }),
    baseLocalityId: uuid('base_locality_id').references(() => localities.id, {
      onDelete: 'set null',
    }),
    baseLocalityName: varchar('base_locality_name', { length: 120 }),
    baseLatitude: doublePrecision('base_latitude'),
    baseLongitude: doublePrecision('base_longitude'),
    baseLocation: geometry('base_location', { type: 'point', mode: 'xy', srid: 4326 }),
    driverCode: varchar('driver_code', { length: 48 }).notNull(),
    licenseNo: varchar('license_no', { length: 64 }).notNull(),
    licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }),
    availabilityStatus: availabilityStatusEnum('availability_status')
      .notNull()
      .default('AVAILABLE'),
    isSuspended: boolean('is_suspended').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('drivers_org_code_uidx').on(table.organizationId, table.driverCode),
    uniqueIndex('drivers_org_user_uidx').on(table.organizationId, table.userId),
    index('drivers_org_status_idx').on(table.organizationId, table.availabilityStatus),
  ],
);

