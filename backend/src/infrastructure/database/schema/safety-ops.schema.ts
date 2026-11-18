import {
  date,
  doublePrecision,
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
import { organizations, users, vendors } from './core-org.schema.js';
import {
  invoiceStatusEnum,
  notificationChannelEnum,
  otpTypeEnum,
  safetyAlertStatusEnum,
  safetyAlertTypeEnum,
  safetySeverityEnum,
} from './enums.js';
import { drivers, employees } from './fleet-people.schema.js';
import { passengerAssignments, trips } from './operations.schema.js';

export const otpRecords = pgTable(
  'otp_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    passengerAssignmentId: uuid('passenger_assignment_id')
      .notNull()
      .references(() => passengerAssignments.id, { onDelete: 'cascade' }),
    otpType: otpTypeEnum('otp_type').notNull(),
    otpCodeHash: varchar('otp_code_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('otp_assign_type_idx').on(table.passengerAssignmentId, table.otpType)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull().default('IN_APP'),
    category: varchar('category', { length: 64 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    body: text('body').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_read_idx').on(
      table.recipientUserId,
      table.readAt,
      table.createdAt,
    ),
  ],
);

export const safetyAlerts = pgTable(
  'safety_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    alertType: safetyAlertTypeEnum('alert_type').notNull(),
    severity: safetySeverityEnum('severity').notNull().default('CRITICAL'),
    status: safetyAlertStatusEnum('status').notNull().default('OPEN'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyM: doublePrecision('accuracy_m'),
    notes: text('notes'),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('safety_alerts_org_status_idx').on(table.organizationId, table.status, table.severity)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 48 }).notNull(),
    action: varchar('action', { length: 96 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    reason: text('reason'),
    beforeJson: jsonb('before_json').$type<Record<string, unknown> | null>(),
    afterJson: jsonb('after_json').$type<Record<string, unknown> | null>(),
    correlationId: varchar('correlation_id', { length: 96 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_org_entity_idx').on(table.organizationId, table.entityType, table.entityId),
    index('audit_logs_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    invoiceNumber: varchar('invoice_number', { length: 64 }).notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    totalTrips: integer('total_trips').notNull().default(0),
    totalDistanceKm: doublePrecision('total_distance_km').notNull().default(0),
    subtotalPaise: integer('subtotal_paise').notNull().default(0),
    taxPaise: integer('tax_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),
    status: invoiceStatusEnum('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('invoices_org_number_uidx').on(table.organizationId, table.invoiceNumber)],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestMethod: varchar('request_method', { length: 12 }).notNull(),
    requestPath: varchar('request_path', { length: 256 }).notNull(),
    requestHash: varchar('request_hash', { length: 128 }).notNull(),
    statusCode: integer('status_code').notNull(),
    responseJson: jsonb('response_json').$type<unknown>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_org_key_uidx').on(table.organizationId, table.idempotencyKey),
    index('idempotency_expires_idx').on(table.expiresAt),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    topic: varchar('topic', { length: 96 }).notNull(),
    aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [index('outbox_pending_idx').on(table.publishedAt, table.createdAt)],
);

