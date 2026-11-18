export const USER_ROLES = [
  'PLATFORM_SUPER_ADMIN',
  'ORG_ADMIN',
  'TRANSPORT_MANAGER',
  'DUTY_APPROVER',
  'VENDOR_SUPERVISOR',
  'DRIVER',
  'EMPLOYEE',
  'AUDITOR',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TRIP_STATUSES = [
  'CREATED',
  'ASSIGNED',
  'DRIVER_ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ABORTED',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const PASSENGER_STATUSES = [
  'SCHEDULED',
  'EN_ROUTE',
  'ARRIVED',
  'BOARDED',
  'NO_SHOW',
  'CANCELLED',
  'SKIPPED',
  'DROPPED',
] as const;
export type PassengerAssignmentStatus = (typeof PASSENGER_STATUSES)[number];

export const NO_SHOW_REASONS = [
  'PASSENGER_UNREACHABLE',
  'DID_NOT_EXIT',
  'CANCELLED_AT_DOOR',
  'WRONG_LOCATION',
  'OTHER',
] as const;
export type NoShowReason = (typeof NO_SHOW_REASONS)[number];

export const TRIP_DIRECTIONS = ['LOGIN', 'LOGOUT'] as const;
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];

export const OTP_TYPES = ['BOARDING', 'DEBOARDING'] as const;
export type OtpType = (typeof OTP_TYPES)[number];

export const BOOKING_RECURRENCE_TYPES = ['ONE_DAY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type BookingRecurrenceType = (typeof BOOKING_RECURRENCE_TYPES)[number];

export const BOOKING_SERIES_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'] as const;
export type BookingSeriesStatus = (typeof BOOKING_SERIES_STATUSES)[number];

export const BOOKING_TIME_PREFERENCES = ['PICKUP_AT', 'ARRIVE_BY'] as const;
export type BookingTimePreference = (typeof BOOKING_TIME_PREFERENCES)[number];

export const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type DayOfWeekCode = (typeof DAYS_OF_WEEK)[number];

export const BOOKING_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'DISPATCHED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

