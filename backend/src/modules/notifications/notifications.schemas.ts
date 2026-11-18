import { z } from 'zod';

export const uuidParamSchema = z.string().uuid();

export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(8).max(4096),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']).default('ANDROID'),
});
export type RegisterDeviceTokenDto = z.infer<typeof registerDeviceTokenSchema>;

export interface NotificationDispatchJob {
  organizationId: string;
  recipientUserId: string;
  category: string;
  title: string;
  body: string;
  channel?: 'IN_APP' | 'PUSH';
  metadataJson?: Record<string, unknown>;
  dedupKey?: string;
  persistDb?: boolean;
  tripId?: string | null;
  employeeId?: string | null;
  driverId?: string | null;
  emitOpsRoom?: boolean;
}

export interface TripReminderJob {
  kind: 'PRE_PICKUP_15M' | 'CAB_APPROACHING';
  organizationId: string;
  tripId: string;
  stopId: string;
  passengerAssignmentId?: string;
  recipientUserId: string;
  employeeId?: string;
  tripCode: string;
  stopLocationName: string;
  distanceM?: number;
  etaMinutes?: number | null;
}

