import { z } from 'zod';
import { TRIP_DIRECTIONS } from '../../infrastructure/shared/enums.js';

export const REPORT_TYPES = [
  'daily-operations',
  'monthly-summary',
  'attendance',
  'no-shows',
  'driver-punctuality',
  'vehicle-utilization',
  'vendor-performance',
  'shift-delays',
  'cost-per-employee',
  'trip-history',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date');

export const reportsFilterQuerySchema = z.object({
  startDate: dateParamSchema.optional(),
  endDate: dateParamSchema.optional(),
  officeId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  direction: z.enum(TRIP_DIRECTIONS).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type ReportsFilterQuery = z.infer<typeof reportsFilterQuerySchema>;

export const reportTypeParamSchema = z.enum(REPORT_TYPES);

export const assistantQuerySchema = z.object({
  question: z.string().trim().min(2).max(400),
  startDate: dateParamSchema.optional(),
  endDate: dateParamSchema.optional(),
  officeId: z.string().uuid().optional(),
});
export type AssistantQueryDto = z.infer<typeof assistantQuerySchema>;
