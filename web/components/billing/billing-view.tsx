"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilePlus2,
  Receipt,
  Send,
} from "lucide-react";
import {
  apiDownloadCsv,
  apiRequest,
  formatInrFromPaise,
  formatLocalTime,
} from "@/lib/api";
import type {
  BillingSummaryData,
  InvoiceDetailResponse,
  InvoicePreviewResponse,
  InvoiceStatus,
  VendorInvoiceItem,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const NEXT_TRANSITIONS: Record<InvoiceStatus, Array<"ISSUED" | "RECONCILED" | "DISPUTED">> = {
  DRAFT: ["ISSUED", "DISPUTED"],
  ISSUED: ["RECONCILED", "DISPUTED"],
  DISPUTED: ["ISSUED", "RECONCILED"],
  RECONCILED: [],
};

export function BillingView() {
  const queryClient = useQueryClient();
  const { identity, canWriteOperations } = useDevSession();
  const { pushToast } = useToast();

  const statusFilterId = useId();
  const vendorFilterId = useId();
  const genVendorId = useId();
  const genStartId = useId();
  const genEndId = useId();
  const genGstId = useId();
  const reconNoteId = useId();

  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");

  const [generateOpen, setGenerateOpen] = useState(false);
  const [genVendor, setGenVendor] = useState("");
  const [genPeriodStart, setGenPeriodStart] = useState("2026-11-01");
  const [genPeriodEnd, setGenPeriodEnd] = useState("2026-11-30");
  const [genGstBps, setGenGstBps] = useState("500");
  const [genNote, setGenNote] = useState("");

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryErr,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["billing-summary", identity.orgId, identity.userId, identity.role, vendorFilter],
    queryFn: () =>
      apiRequest<BillingSummaryData>("/admin/billing/summary", identity, {
        query: { vendorId: vendorFilter || undefined },
      }),
  });

  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    error: invoicesErr,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: [
      "billing-invoices",
      identity.orgId,
      identity.userId,
      identity.role,
      vendorFilter,
      statusFilter,
    ],
    queryFn: () =>
      apiRequest<VendorInvoiceItem[]>("/admin/billing/invoices", identity, {
        query: {
          vendorId: vendorFilter || undefined,
          status: statusFilter || undefined,
        },
      }),
  });

  const effectiveGenVendor = genVendor || summary?.vendors[0]?.id || "";

  const {
    data: preview,
    isFetching: previewLoading,
    error: previewErr,
  } = useQuery({
    queryKey: [
      "billing-preview",
      identity.orgId,
      effectiveGenVendor,
      genPeriodStart,
      genPeriodEnd,
      genGstBps,
    ],
    enabled:
      generateOpen &&
      Boolean(effectiveGenVendor) &&
      Boolean(genPeriodStart) &&
      Boolean(genPeriodEnd),
    queryFn: () =>
      apiRequest<InvoicePreviewResponse>("/admin/billing/invoices/preview", identity, {
        query: {
          vendorId: effectiveGenVendor,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          gstBps: Number(genGstBps) || 500,
        },
      }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["billing-invoice-detail", identity.orgId, selectedInvoiceId],
    enabled: Boolean(selectedInvoiceId),
    queryFn: () =>
      apiRequest<InvoiceDetailResponse>(
        `/admin/billing/invoices/${selectedInvoiceId}`,
        identity,
      ),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ invoice: VendorInvoiceItem }>("/admin/billing/invoices/generate", identity, {
        method: "POST",
        idempotent: true,
        body: {
          vendorId: effectiveGenVendor,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          gstBps: Number(genGstBps) || 500,
          initialStatus: "DRAFT",
          note: genNote.trim() || undefined,
        },
      }),
    onSuccess: (res) => {
      pushToast({
        tone: "success",
        title: `Invoice ${res.invoice.invoiceNumber} generated`,
        description: `Total ${formatInrFromPaise(res.invoice.totalPaise)} across ${res.invoice.totalTrips} trip(s).`,
      });
      setGenerateOpen(false);
      setGenNote("");
      setSelectedInvoiceId(res.invoice.id);
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Invoice generation failed",
        description: err.message,
      });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (payload: {
      invoiceId: string;
      status: "ISSUED" | "RECONCILED" | "DISPUTED";
      note?: string;
    }) =>
      apiRequest<VendorInvoiceItem>(
        `/admin/billing/invoices/${payload.invoiceId}/status`,
        identity,
        {
          method: "PATCH",
          body: {
            status: payload.status,
            note: payload.note?.trim() || undefined,
          },
        },
      ),
    onSuccess: (updated) => {
      pushToast({
        tone: "success",
        title: `Invoice marked ${updated.status}`,
      });
      setStatusNote("");
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-invoice-detail"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Status update failed",
        description: err.message,
      });
    },
  });

  const handleDownloadStatement = useCallback(
    async (invoiceId: string, invoiceNumber: string) => {
      try {
        await apiDownloadCsv(
          `/admin/billing/invoices/${invoiceId}/export`,
          identity,
          `${invoiceNumber}.csv`,
        );
        pushToast({
          tone: "success",
          title: `Exported ${invoiceNumber}.csv`,
        });
      } catch (err) {
        pushToast({
          tone: "error",
          title: "Statement export failed",
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [identity, pushToast],
  );

  const canFlagDispute =
    canWriteOperations || identity.role === "VENDOR_SUPERVISOR";

  const invoiceColumns = useMemo<LegacyColumnDef<VendorInvoiceItem, unknown>[]>(
    () => [
      {
        id: "number",
        header: "Invoice #",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => {
              setSelectedInvoiceId(row.original.id);
              setStatusNote("");
            }}
            className="text-left font-mono text-xs font-semibold text-primary hover:underline tabular-nums"
          >
            {row.original.invoiceNumber}
          </button>
        ),
      },
      {
        id: "vendor",
        header: "Vendor",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.vendorName}</p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.vendorCode}
            </p>
          </div>
        ),
      },
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.periodStart} to {row.original.periodEnd}
          </span>
        ),
      },
      {
        id: "volume",
        header: "Trips / Distance",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.totalTrips} trip(s) · {row.original.totalDistanceKm.toFixed(2)} km
          </span>
        ),
      },
      {
        id: "total",
        header: "Total (INR)",
        cell: ({ row }) => (
          <div className="font-mono text-xs tabular-nums">
            <p className="font-semibold text-foreground">
              {formatInrFromPaise(row.original.totalPaise)}
            </p>
            <p className="text-muted-foreground">
              incl. {formatInrFromPaise(row.original.taxPaise)} GST
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge tone={statusToneFor(row.original.status)} dot>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setSelectedInvoiceId(row.original.id);
                setStatusNote("");
              }}
            >
              Inspect
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Export CSV for ${row.original.invoiceNumber}`}
              onClick={() =>
                void handleDownloadStatement(
                  row.original.id,
                  row.original.invoiceNumber,
                )
              }
            >
              <Download className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [handleDownloadStatement],
  );

  const combinedErr = summaryErr ?? invoicesErr;

  return (
    <AdminShell
      title="Vendor Billing & Reconciliation"
      subtitle="Paise-exact tariff billing from GPS traces & stop corridors, GST invoicing, and dispute audit logs"
      headerActions={
        canWriteOperations ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setGenerateOpen(true)}
          >
            <FilePlus2 className="size-3.5" aria-hidden="true" />
            Generate Invoice
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {combinedErr && (
          <QueryErrorBanner
            message={combinedErr.message}
            onRetry={() => {
              void refetchSummary();
              void refetchInvoices();
            }}
          />
        )}

        {/* Billing KPI Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryLoading || !summary ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[10px] border border-border bg-card p-4 space-y-2"
              >
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          ) : (
            <>
              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Reconciled Spend
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(summary.byStatus.RECONCILED.totalPaise)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {summary.byStatus.RECONCILED.count} settled invoice(s)
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Issued / Pending Approval
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(summary.byStatus.ISSUED.totalPaise)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {summary.byStatus.ISSUED.count} issued ·{" "}
                  {summary.byStatus.DRAFT.count} draft(s)
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Disputed Under Review
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(summary.byStatus.DISPUTED.totalPaise)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {summary.byStatus.DISPUTED.count} disputed invoice(s)
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Unbilled Completed Trips
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {summary.unbilledCompletedTrips}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  out of {summary.completedTripsInRange} completed trip(s)
                </p>
              </ManifestCard>
            </>
          )}
        </div>

        {/* Invoices Ledger */}
        <ManifestCard>
          <ManifestHeader
            title="Vendor Invoices Ledger"
            description="Generated billing batches, GST breakdowns, and reconciliation state"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 border-b border-border bg-[#F8FAFC] px-4 py-3">
            <div>
              <FieldLabel htmlFor={vendorFilterId}>Filter by Vendor</FieldLabel>
              <Select
                id={vendorFilterId}
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
              >
                <option value="">All fleet vendors</option>
                {(summary?.vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={statusFilterId}>Invoice Status</FieldLabel>
              <Select
                id={statusFilterId}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "" | InvoiceStatus)
                }
              >
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ISSUED">Issued</option>
                <option value="DISPUTED">Disputed</option>
                <option value="RECONCILED">Reconciled</option>
              </Select>
            </div>
          </div>

          <DataLedger
            data={invoices}
            columns={invoiceColumns}
            isLoading={invoicesLoading}
            emptyTitle="No vendor invoices generated yet"
            emptyDescription="Complete vendor trips and use Generate Invoice to compute tariff settlements and export statements."
            emptyAction={
              canWriteOperations ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setGenerateOpen(true)}
                >
                  <FilePlus2 className="size-3.5" aria-hidden="true" />
                  Generate First Invoice
                </Button>
              ) : undefined
            }
          />
        </ManifestCard>

        {/* Active Vendor Tariff Schedule */}
        <ManifestCard>
          <ManifestHeader
            title="Active Vendor Tariff Cards (INR)"
            description="Base trip fees and distance rates used for automated invoice math"
          />
          <div className="divide-y divide-border">
            {(summary?.vendors ?? []).map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{v.name}</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {v.code} · {v.contactName} · {v.contactPhone}
                  </p>
                </div>
                <div className="font-mono text-xs text-right tabular-nums">
                  <p className="font-semibold text-foreground">
                    {formatInrFromPaise(v.billingBaseTripPaise)} base / trip
                  </p>
                  <p className="text-muted-foreground">
                    + {formatInrFromPaise(v.billingRatePerKmPaise)} / km
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ManifestCard>
      </div>

      {/* Preview & Generate Invoice Drawer */}
      <SlideOverDrawer
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate Vendor Invoice"
        subtitle="Pre-calculates distance & INR paise totals across COMPLETED trips"
        width="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor={genVendorId} required>
                Vendor
              </FieldLabel>
              <Select
                id={genVendorId}
                value={effectiveGenVendor}
                onChange={(e) => setGenVendor(e.target.value)}
              >
                {(summary?.vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={genGstId}>GST Rate</FieldLabel>
              <Select
                id={genGstId}
                value={genGstBps}
                onChange={(e) => setGenGstBps(e.target.value)}
              >
                <option value="500">5% (SAC Passenger Transport)</option>
                <option value="1200">12%</option>
                <option value="1800">18%</option>
                <option value="0">0% (Exempt / Nil)</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={genStartId} required>
                Period Start
              </FieldLabel>
              <Input
                id={genStartId}
                type="date"
                value={genPeriodStart}
                onChange={(e) => setGenPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor={genEndId} required>
                Period End
              </FieldLabel>
              <Input
                id={genEndId}
                type="date"
                value={genPeriodEnd}
                onChange={(e) => setGenPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {previewErr && (
            <QueryErrorBanner message={previewErr.message} />
          )}

          {previewLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : preview ? (
            <div className="space-y-3 border-t border-border pt-4">
              {preview.overlappingInvoices.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#B45309]">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Overlapping invoice(s) already exist for this window:{" "}
                    {preview.overlappingInvoices
                      .map((i) => `${i.invoiceNumber} (${i.status})`)
                      .join(", ")}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground">Billable Trips</p>
                  <p className="font-mono text-base font-semibold tabular-nums">
                    {preview.totals.totalTrips}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground">Distance</p>
                  <p className="font-mono text-base font-semibold tabular-nums">
                    {preview.totals.totalDistanceKm.toFixed(2)} km
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground">Subtotal</p>
                  <p className="font-mono text-base font-semibold tabular-nums">
                    {formatInrFromPaise(preview.totals.subtotalPaise)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[11px] text-muted-foreground">Grand Total</p>
                  <p className="font-mono text-base font-semibold text-primary tabular-nums">
                    {formatInrFromPaise(preview.totals.totalPaise)}
                  </p>
                </div>
              </div>

              {preview.lineItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No COMPLETED trips found for {preview.vendor.code} between{" "}
                  {preview.periodStart} and {preview.periodEnd}.
                  {preview.inFlightCount > 0
                    ? ` (${preview.inFlightCount} active trip(s) still in flight.)`
                    : ""}
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                  {preview.lineItems.map((line) => (
                    <div
                      key={line.tripId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-foreground tabular-nums">
                          {line.tripCode}{" "}
                          <span className="font-sans font-normal text-muted-foreground">
                            · {line.travelDate} · {line.distanceKm.toFixed(2)} km (
                            {line.distanceSource === "GPS_TRACE"
                              ? "GPS trace"
                              : "Corridor est."})
                          </span>
                        </p>
                        {line.disputeFlags.length > 0 && (
                          <p className="mt-0.5 font-mono text-[11px] text-[#B45309]">
                            Flags: {line.disputeFlags.join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="font-mono font-semibold shrink-0 tabular-nums">
                        {formatInrFromPaise(line.lineSubtotalPaise)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <FieldLabel htmlFor="gen-inv-note">
                  Generation Note (optional)
                </FieldLabel>
                <Input
                  id="gen-inv-note"
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  placeholder="e.g., November billing batch"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGenerateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    preview.totals.totalTrips === 0 || generateMutation.isPending
                  }
                  onClick={() => generateMutation.mutate()}
                >
                  <Receipt className="size-3.5" aria-hidden="true" />
                  {generateMutation.isPending
                    ? "Generating..."
                    : "Create Draft Invoice"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SlideOverDrawer>

      {/* Invoice Reconciliation Inspector Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedInvoiceId)}
        onClose={() => setSelectedInvoiceId(null)}
        title={detail?.invoice.invoiceNumber ?? "Invoice Statement"}
        subtitle={
          detail
            ? `${detail.invoice.vendorName} · ${detail.invoice.periodStart} to ${detail.invoice.periodEnd}`
            : undefined
        }
        width="lg"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge tone={statusToneFor(detail.invoice.status)} dot>
                {detail.invoice.status}
              </StatusBadge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void handleDownloadStatement(
                    detail.invoice.id,
                    detail.invoice.invoiceNumber,
                  )
                }
              >
                <Download className="size-3.5" aria-hidden="true" />
                Download CSV Statement
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-border bg-[#F8FAFC] p-3 text-xs">
              <div>
                <p className="text-muted-foreground">Subtotal</p>
                <p className="mt-0.5 font-mono font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(detail.invoice.subtotalPaise)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Tax ({(detail.inferredGstBps / 100).toFixed(1)}% GST)
                </p>
                <p className="mt-0.5 font-mono font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(detail.invoice.taxPaise)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Grand Total</p>
                <p className="mt-0.5 font-mono font-semibold text-primary tabular-nums">
                  {formatInrFromPaise(detail.invoice.totalPaise)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-foreground mb-2">
                Itemized Completed Trips ({detail.lineItems.length})
              </h3>
              <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {detail.lineItems.map((item) => (
                  <div
                    key={item.tripId}
                    className="flex items-start justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-mono font-semibold text-foreground tabular-nums">
                        {item.tripCode}{" "}
                        <span className="font-sans font-normal text-muted-foreground">
                          · {item.driverName ?? "Unassigned"} (
                          {item.vehicleRegistrationNo ?? "No cab"})
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                        {item.distanceKm.toFixed(2)} km (
                        {item.distanceSource === "GPS_TRACE"
                          ? "GPS trace"
                          : "Corridor est."}
                        ) · {formatInrFromPaise(item.baseFeePaise)} +{" "}
                        {formatInrFromPaise(item.distanceFeePaise)}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-foreground shrink-0 tabular-nums">
                      {formatInrFromPaise(item.lineSubtotalPaise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {NEXT_TRANSITIONS[detail.invoice.status].length > 0 &&
              canFlagDispute && (
                <div className="space-y-3 border-t border-border pt-4">
                  <FieldLabel htmlFor={reconNoteId}>
                    Reconciliation / Dispute Note (required for disputes)
                  </FieldLabel>
                  <Textarea
                    id={reconNoteId}
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Document verification note, toll discrepancy, or settlement batch reference..."
                  />
                  <div className="flex flex-wrap gap-2">
                    {canWriteOperations &&
                      NEXT_TRANSITIONS[detail.invoice.status].includes(
                        "ISSUED",
                      ) && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={transitionMutation.isPending}
                          onClick={() =>
                            transitionMutation.mutate({
                              invoiceId: detail.invoice.id,
                              status: "ISSUED",
                              note: statusNote,
                            })
                          }
                        >
                          <Send className="size-3.5" aria-hidden="true" />
                          Issue Invoice
                        </Button>
                      )}
                    {canWriteOperations &&
                      NEXT_TRANSITIONS[detail.invoice.status].includes(
                        "RECONCILED",
                      ) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={transitionMutation.isPending}
                          onClick={() =>
                            transitionMutation.mutate({
                              invoiceId: detail.invoice.id,
                              status: "RECONCILED",
                              note: statusNote,
                            })
                          }
                        >
                          <CheckCircle2 className="size-3.5 text-[#0D9488]" aria-hidden="true" />
                          Mark Reconciled
                        </Button>
                      )}
                    {NEXT_TRANSITIONS[detail.invoice.status].includes(
                      "DISPUTED",
                    ) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={
                          transitionMutation.isPending ||
                          statusNote.trim().length < 3
                        }
                        onClick={() =>
                          transitionMutation.mutate({
                            invoiceId: detail.invoice.id,
                            status: "DISPUTED",
                            note: statusNote,
                          })
                        }
                      >
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        Flag Disputed
                      </Button>
                    )}
                  </div>
                </div>
              )}

            {detail.auditHistory.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-xs font-semibold text-foreground">
                  Audit Trail
                </h3>
                <div className="space-y-2">
                  {detail.auditHistory.map((evt) => (
                    <div
                      key={evt.id}
                      className="rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-foreground">
                          {evt.action}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatLocalTime(evt.createdAt)} · {evt.actorRole}
                        </span>
                      </div>
                      {evt.reason && (
                        <p className="mt-1 text-muted-foreground">{evt.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>
    </AdminShell>
  );
}
