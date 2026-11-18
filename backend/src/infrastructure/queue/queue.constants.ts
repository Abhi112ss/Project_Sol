export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  TRIP_REMINDERS: 'trip-reminders',
  ETA_CALCULATIONS: 'eta-calculations',
  LOCATION_PROCESSING: 'location-processing',
  REPORTS: 'reports',
  SCHEDULED_JOBS: 'scheduled-jobs',
  VENDOR_RECONCILIATION: 'vendor-reconciliation',
  BOOKING_MAINTENANCE: 'booking-maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

