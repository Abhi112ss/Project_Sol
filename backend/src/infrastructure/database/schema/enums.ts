import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'PLATFORM_SUPER_ADMIN',
  'ORG_ADMIN',
  'TRANSPORT_MANAGER',
  'DUTY_APPROVER',
  'VENDOR_SUPERVISOR',
  'DRIVER',
  'EMPLOYEE',
  'AUDITOR',
]);

export const orgStatusEnum = pgEnum('org_status', ['ACTIVE', 'SUSPENDED', 'TRIAL']);

export const tripDirectionEnum = pgEnum('trip_direction', ['LOGIN', 'LOGOUT']);

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'SEDAN',
  'SUV',
  'TEMPO_TRAVELLER',
  'EV_SEDAN',
  'SHUTTLE_BUS',
]);

export const availabilityStatusEnum = pgEnum('availability_status', [
  'AVAILABLE',
  'ON_TRIP',
  'OFF_DUTY',
  'MAINTENANCE',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'CANCELLED',
  'EXPIRED',
]);

export const bookingRecurrenceTypeEnum = pgEnum('booking_recurrence_type', [
  'ONE_DAY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
]);

export const bookingSeriesStatusEnum = pgEnum('booking_series_status', [
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'CANCELLED',
]);

export const bookingTimePreferenceEnum = pgEnum('booking_time_preference', [
  'PICKUP_AT',
  'ARRIVE_BY',
]);

export const approvalDecisionEnum = pgEnum('approval_decision', ['APPROVED', 'REJECTED']);

export const tripStatusEnum = pgEnum('trip_status', [
  'CREATED',
  'ASSIGNED',
  'DRIVER_ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ABORTED',
]);

export const stopTypeEnum = pgEnum('stop_type', ['PICKUP', 'DROP', 'OFFICE']);

export const stopStatusEnum = pgEnum('stop_status', [
  'PENDING',
  'ACTIVE',
  'ARRIVED',
  'COMPLETED',
  'SKIPPED',
]);

export const passengerAssignmentStatusEnum = pgEnum('passenger_assignment_status', [
  'SCHEDULED',
  'EN_ROUTE',
  'ARRIVED',
  'BOARDED',
  'NO_SHOW',
  'CANCELLED',
  'SKIPPED',
  'DROPPED',
]);

export const noShowReasonEnum = pgEnum('no_show_reason', [
  'PASSENGER_UNREACHABLE',
  'DID_NOT_EXIT',
  'CANCELLED_AT_DOOR',
  'WRONG_LOCATION',
  'OTHER',
]);

export const noShowSyncStatusEnum = pgEnum('no_show_sync_status', [
  'VERIFIED',
  'PENDING_RECONCILE',
]);

export const noShowAppealStatusEnum = pgEnum('no_show_appeal_status', [
  'NONE',
  'APPEALED',
  'OVERTURNED',
  'UPHELD',
]);

export const otpTypeEnum = pgEnum('otp_type', ['BOARDING', 'DEBOARDING']);

export const notificationChannelEnum = pgEnum('notification_channel', ['IN_APP', 'PUSH']);

export const safetyAlertTypeEnum = pgEnum('safety_alert_type', [
  'SOS',
  'ROUTE_DEVIATION',
  'LONG_STOPPAGE',
  'SAFE_REACH_OVERDUE',
]);

export const safetySeverityEnum = pgEnum('safety_severity', ['MEDIUM', 'HIGH', 'CRITICAL']);

export const safetyAlertStatusEnum = pgEnum('safety_alert_status', [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'ISSUED',
  'RECONCILED',
  'DISPUTED',
]);

