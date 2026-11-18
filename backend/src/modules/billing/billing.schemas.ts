import { z } from 'zod';

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'RECONCILED', 'DISPUTED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date');
export const uuidParamSchema = z.string().uuid();

export const listInvoicesQuerySchema = z.object({
  vendorId: z.string().uuid().optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  periodStart: dateStringSchema.optional(),
  periodEnd: dateStringSchema.optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const billingSummaryQuerySchema = z.object({
  periodStart: dateStringSchema.optional(),
  periodEnd: dateStringSchema.optional(),
  vendorId: z.string().uuid().optional(),
});
export type BillingSummaryQuery = z.infer<typeof billingSummaryQuerySchema>;

export const previewInvoiceQuerySchema = z.object({
  vendorId: z.string().uuid(),
  periodStart: dateStringSchema,
  periodEnd: dateStringSchema,
  gstBps: z.coerce.number().int().min(0).max(2800).default(500),
});
export type PreviewInvoiceQuery = z.infer<typeof previewInvoiceQuerySchema>;

export const generateInvoiceSchema = z.object({
  vendorId: z.string().uuid(),
  periodStart: dateStringSchema,
  periodEnd: dateStringSchema,
  gstBps: z.number().int().min(0).max(2800).default(500),
  initialStatus: z.enum(['DRAFT', 'ISSUED']).default('DRAFT'),
  note: z.string().trim().max(500).optional(),
});
export type GenerateInvoiceDto = z.infer<typeof generateInvoiceSchema>;

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['ISSUED', 'RECONCILED', 'DISPUTED']),
  note: z.string().trim().min(3).max(500).optional(),
});
export type UpdateInvoiceStatusDto = z.infer<typeof updateInvoiceStatusSchema>;

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'DISPUTED'],
  ISSUED: ['RECONCILED', 'DISPUTED'],
  DISPUTED: ['ISSUED', 'RECONCILED'],
  RECONCILED: [],
};
