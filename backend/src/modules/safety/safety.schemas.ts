import { z } from 'zod';

export const uuidParamSchema = z.string().uuid();

export const triggerSosSchema = z.object({
  tripId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(5000).optional(),
  notes: z.string().max(500).optional(),
});
export type TriggerSosDto = z.infer<typeof triggerSosSchema>;

export const listSafetyAlertsQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  alertType: z
    .enum(['SOS', 'ROUTE_DEVIATION', 'LONG_STOPPAGE', 'SAFE_REACH_OVERDUE'])
    .optional(),
  severity: z.enum(['MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
export type ListSafetyAlertsQuery = z.infer<typeof listSafetyAlertsQuerySchema>;

export const acknowledgeAlertSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});
export type AcknowledgeAlertDto = z.infer<typeof acknowledgeAlertSchema>;

export const resolveAlertSchema = z.object({
  resolutionNotes: z.string().trim().min(3).max(500),
});
export type ResolveAlertDto = z.infer<typeof resolveAlertSchema>;

