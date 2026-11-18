"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bot,
  Download,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  apiDownloadCsv,
  apiRequest,
  formatDelayBadge,
  formatInrFromPaise,
} from "@/lib/api";
import type {
  AssistantQueryResponse,
  ReportsAnalyticsBundle,
  ReportType,
  ShiftItem,
  TripDirection,
  VendorItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { EmptyState, QueryErrorBanner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type LedgerTab = "VENDORS" | "DRIVERS" | "VEHICLES" | "EMPLOYEES" | "NOSHOW_RISK";

const REPORT_EXPORT_OPTIONS: Array<{ value: ReportType; label: string }> = [
  { value: "daily-operations", label: "Daily Operations Report" },
  { value: "monthly-summary", label: "Monthly Summary Report" },
  { value: "vendor-performance", label: "Vendor Performance SLA" },
  { value: "driver-punctuality", label: "Driver Punctuality" },
  { value: "vehicle-utilization", label: "Vehicle Seat Utilization" },
  { value: "attendance", label: "Employee Attendance" },
  { value: "cost-per-employee", label: "Cost Per Employee" },
  { value: "no-shows", label: "No-Show Audit" },
  { value: "shift-delays", label: "Shift Delay Decomposition" },
  { value: "trip-history", label: "Trip History Ledger" },
];

const ASSISTANT_PROMPTS = [
  "Which drivers are currently delayed?",
  "Which employees had repeated no-shows this month?",
  "How many vehicles are available tomorrow morning?",
  "Which vendor has the highest late-pickup frequency?",
  "Why did today's 9 AM shift experience delays?",
];

const subscribeNoop = () => () => {};

function useClientMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ReportsView() {
  const mounted = useClientMounted();
  const { identity, activeOfficeId } = useDevSession();
  const { pushToast } = useToast();

  const startDateId = useId();
  const endDateId = useId();
  const shiftFilterId = useId();
  const vendorFilterId = useId();
  const dirFilterId = useId();
  const exportSelectId = useId();
  const assistantInputId = useId();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [direction, setDirection] = useState<"" | TripDirection>("");
  const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>("VENDORS");
  const [exportReportType, setExportReportType] =
    useState<ReportType>("daily-operations");
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [question, setQuestion] = useState(ASSISTANT_PROMPTS[0]);
  const [assistantResult, setAssistantResult] =
    useState<AssistantQueryResponse | null>(null);

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts-reports", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<ShiftItem[]>("/admin/shifts", identity),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-reports", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VendorItem[]>("/admin/vendors", identity),
  });

  const queryParams = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      officeId: activeOfficeId || undefined,
      shiftId: shiftId || undefined,
      vendorId: vendorId || undefined,
      direction: direction || undefined,
    }),
    [startDate, endDate, activeOfficeId, shiftId, vendorId, direction],
  );

  const {
    data: analytics,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "reports-summary",
      identity.orgId,
      identity.userId,
      identity.role,
      queryParams,
    ],
    queryFn: () =>
      apiRequest<ReportsAnalyticsBundle>("/admin/reports/summary", identity, {
        query: queryParams,
      }),
  });

  const assistantMutation = useMutation({
    mutationFn: (q: string) =>
      apiRequest<AssistantQueryResponse>("/admin/reports/assistant/query", identity, {
        method: "POST",
        body: {
          question: q,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          officeId: activeOfficeId || undefined,
        },
      }),
    onSuccess: (res) => {
      setAssistantResult(res);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Operational assistant notice",
        description: err.message,
      });
    },
  });

  const canUseAssistant =
    identity.role === "ORG_ADMIN" ||
    identity.role === "TRANSPORT_MANAGER" ||
    identity.role === "DUTY_APPROVER" ||
    identity.role === "AUDITOR" ||
    identity.role === "PLATFORM_SUPER_ADMIN";

  const handleExportCsv = async () => {
    try {
      setDownloadingCsv(true);
      await apiDownloadCsv(
        `/admin/reports/${exportReportType}`,
        identity,
        `soltransit-${exportReportType}.csv`,
        { ...queryParams, format: "csv" },
      );
      pushToast({
        tone: "success",
        title: "CSV exported",
        description: `Downloaded ${exportReportType} report.`,
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "CSV export failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDownloadingCsv(false);
    }
  };

  const trendChartData = useMemo(() => {
    if (!analytics) return [];
    if (granularity === "monthly") {
      return analytics.monthlySeries.map((m) => ({
        label: m.month,
        Boarded: m.boarded,
        "No-Show": m.noShow,
        Cancelled: m.cancelled,
      }));
    }
    return analytics.dailySeries.map((d) => ({
      label: d.date.slice(5),
      Boarded: d.boarded,
      "No-Show": d.noShow,
      Cancelled: d.cancelled,
    }));
  }, [analytics, granularity]);

  const delayChartData = useMemo(() => {
    if (!analytics) return [];
    return analytics.shiftDelayPatterns.map((s) => ({
      label: `${s.shiftTimeLocal} (${s.direction === "LOGIN" ? "In" : "Out"})`,
      "Driver Delay (s)": s.avgArrivalDelaySeconds,
      "Passenger Wait (s)": s.avgWaitSeconds,
    }));
  }, [analytics]);

  const vendorColumns = useMemo<
    LegacyColumnDef<ReportsAnalyticsBundle["vendorPerformance"][number], unknown>[]
  >(
    () => [
      {
        id: "vendor",
        header: "Vendor Partner",
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
        id: "trips",
        header: "Trips (Done / Canc.)",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.completedTrips} / {row.original.cancelledOrAbortedTrips}
          </span>
        ),
      },
      {
        id: "delay",
        header: "Avg Arrival Delay",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatDelayBadge(row.original.avgArrivalDelaySeconds)}
          </span>
        ),
      },
      {
        id: "noshow",
        header: "No-Show Rate",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.noShowRatePct}% ({row.original.noShowRiders})
          </span>
        ),
      },
      {
        id: "distance",
        header: "Distance",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.totalDistanceKm.toFixed(2)} km
          </span>
        ),
      },
      {
        id: "spend",
        header: "Est. Spend",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {formatInrFromPaise(row.original.estimatedCostPaise)}
          </span>
        ),
      },
    ],
    [],
  );

  const driverColumns = useMemo<
    LegacyColumnDef<ReportsAnalyticsBundle["driverPunctuality"][number], unknown>[]
  >(
    () => [
      {
        id: "driver",
        header: "Chauffeur",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.driverName}</p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.driverCode}
            </p>
          </div>
        ),
      },
      {
        id: "trips",
        header: "Completed Trips",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.completedTrips} / {row.original.totalTrips}
          </span>
        ),
      },
      {
        id: "ontime",
        header: "On-Time Rate",
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.onTimePct >= 80 ? "emerald" : "amber"}
            dot
          >
            {row.original.onTimePct}% ({row.original.onTimeStops}/{row.original.evaluatedStops})
          </StatusBadge>
        ),
      },
      {
        id: "arrival",
        header: "Avg Arrival Delay",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {formatDelayBadge(row.original.avgArrivalDelaySeconds)}
          </span>
        ),
      },
      {
        id: "wait",
        header: "Avg Rider Wait",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.avgWaitSeconds}s
          </span>
        ),
      },
    ],
    [],
  );

  const vehicleColumns = useMemo<
    LegacyColumnDef<ReportsAnalyticsBundle["vehicleUtilization"][number], unknown>[]
  >(
    () => [
      {
        id: "vehicle",
        header: "Cab Registration",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-semibold text-foreground tabular-nums">
              {row.original.registrationNo}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.modelName} ({row.original.seatingCapacity} seats)
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Availability",
        cell: ({ row }) => (
          <StatusBadge tone={statusToneFor(row.original.availabilityStatus)} dot>
            {row.original.availabilityStatus}
          </StatusBadge>
        ),
      },
      {
        id: "trips",
        header: "Trips Dispatched",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.tripsDispatched} ({row.original.tripsCompleted} done)
          </span>
        ),
      },
      {
        id: "util",
        header: "Seat Utilization",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.seatUtilizationPct}% ({row.original.boardedRiders}/
            {row.original.maxSeatCapacityAcrossTrips})
          </span>
        ),
      },
      {
        id: "km",
        header: "Distance Logged",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.totalDistanceKm.toFixed(2)} km
          </span>
        ),
      },
    ],
    [],
  );

  const employeeColumns = useMemo<
    LegacyColumnDef<ReportsAnalyticsBundle["employeeAttendanceCost"][number], unknown>[]
  >(
    () => [
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.employeeName}</p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.employeeCode} · {row.original.department}
            </p>
          </div>
        ),
      },
      {
        id: "attendance",
        header: "Boarded / Sched.",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.boardedRides} / {row.original.scheduledRides}
          </span>
        ),
      },
      {
        id: "exceptions",
        header: "No-Show / Canc.",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.noShowRides} / {row.original.cancelledRides}
          </span>
        ),
      },
      {
        id: "otp",
        header: "OTP Verified",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.otpVerifiedRides}
          </span>
        ),
      },
      {
        id: "cost",
        header: "Attributed Cost",
        cell: ({ row }) => (
          <div className="text-right font-mono text-xs tabular-nums">
            <p className="font-semibold text-foreground">
              {formatInrFromPaise(row.original.attributedCostPaise)}
            </p>
            <p className="text-muted-foreground">
              {formatInrFromPaise(row.original.costPerBoardedRidePaise)} / ride
            </p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <AdminShell
      title="Operational Analytics & SLA Reports"
      subtitle="Attendance, decomposed delay attribution, vendor scorecards, CSV exports, and read-only ops queries"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canUseAssistant && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssistantOpen(true)}
            >
              <Bot className="size-3.5 text-primary" aria-hidden="true" />
              Ops Query Assistant
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={downloadingCsv}
            onClick={() => void handleExportCsv()}
          >
            <Download className="size-3.5" aria-hidden="true" />
            {downloadingCsv ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <QueryErrorBanner
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {/* Filter Bar + CSV Selector */}
        <ManifestCard className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <FieldLabel htmlFor={startDateId}>Period Start</FieldLabel>
              <Input
                id={startDateId}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor={endDateId}>Period End</FieldLabel>
              <Input
                id={endDateId}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor={shiftFilterId}>Shift</FieldLabel>
              <Select
                id={shiftFilterId}
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              >
                <option value="">All shifts</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shiftTimeLocal} · {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={vendorFilterId}>Vendor</FieldLabel>
              <Select
                id={vendorFilterId}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">All vendors</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} · {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={dirFilterId}>Direction</FieldLabel>
              <Select
                id={dirFilterId}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "" | TripDirection)}
              >
                <option value="">Login &amp; Logout</option>
                <option value="LOGIN">Login (To Campus)</option>
                <option value="LOGOUT">Logout (Home)</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor={exportSelectId}>CSV Export Dataset</FieldLabel>
              <Select
                id={exportSelectId}
                value={exportReportType}
                onChange={(e) => setExportReportType(e.target.value as ReportType)}
              >
                {REPORT_EXPORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {analytics && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                Window: {analytics.periodStart} to {analytics.periodEnd}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGranularity("daily")}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    granularity === "daily"
                      ? "bg-[#EFF6FF] text-[#1D4ED8]"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Daily Trend
                </button>
                <button
                  type="button"
                  onClick={() => setGranularity("monthly")}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                    granularity === "monthly"
                      ? "bg-[#EFF6FF] text-[#1D4ED8]"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Monthly Trend
                </button>
                {(startDate || endDate || shiftId || vendorId || direction) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setShiftId("");
                      setVendorId("");
                      setDirection("");
                    }}
                    className="ml-2 text-primary hover:underline"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          )}
        </ManifestCard>

        {/* Top KPI Strip (4 compact single-elevation hairline cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading || !analytics ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[10px] border border-border bg-card p-4 space-y-2"
              >
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))
          ) : (
            <>
              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Completed Trips
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {analytics.overview.completedTrips}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {analytics.overview.totalTrips}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {analytics.overview.completionRatePct}% fulfillment ·{" "}
                  {analytics.overview.totalDistanceKm.toFixed(1)} km
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Pickup Punctuality &amp; OTP
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {analytics.overview.onTimePct}%
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  OTP verified: {analytics.overview.otpCompliancePct}% (
                  {analytics.overview.otpVerifiedCount}/
                  {analytics.overview.boardedRiders})
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Delay vs Wait Decomposition
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {formatDelayBadge(analytics.overview.avgArrivalDelaySeconds)}
                  <span className="mx-1.5 text-muted-foreground">/</span>
                  {analytics.overview.avgWaitSeconds}s
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  Driver arrival vs rider wait (P95:{" "}
                  {formatDelayBadge(analytics.overview.p95ArrivalDelaySeconds)})
                </p>
              </ManifestCard>

              <ManifestCard className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Estimated Spend &amp; No-Shows
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  {formatInrFromPaise(
                    analytics.overview.estimatedTotalCostPaise,
                  )}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatInrFromPaise(
                    analytics.overview.avgCostPerBoardedRidePaise,
                  )}
                  /ride · {analytics.overview.noShowRiders} no-show(s)
                </p>
              </ManifestCard>
            </>
          )}
        </div>

        {/* Interactive Recharts Analytics Pair */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ManifestCard>
            <ManifestHeader
              title="Attendance & Boarding Fulfillment"
              description="Boarded passengers vs verified no-shows and employee cancellations"
            />
            <div className="p-4 h-[280px] w-full min-w-0">
              {!mounted || isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : trendChartData.length === 0 ? (
                <EmptyState
                  title="No trip series in this date range"
                  description="Dispatch and complete trips or widen your date range to visualize attendance trends."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                  <BarChart
                    data={trendChartData}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#5B6E84" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#5B6E84" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#D9E2EC",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar
                      dataKey="Boarded"
                      stackId="riders"
                      fill="#0D9488"
                      maxBarSize={56}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="No-Show"
                      stackId="riders"
                      fill="#E11D48"
                      maxBarSize={56}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="Cancelled"
                      stackId="riders"
                      fill="#94A3B8"
                      maxBarSize={56}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ManifestCard>

          <ManifestCard>
            <ManifestHeader
              title="Shift Delay Attribution (Driver vs Wait)"
              description="Separates cab arrival variance from passenger kerbside dwell per shift"
            />
            <div className="p-4 h-[280px] w-full min-w-0">
              {!mounted || isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : delayChartData.length === 0 ? (
                <EmptyState
                  title="No evaluated stop timings yet"
                  description="Completed arrivals and boarding timestamps populate shift delay patterns."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={200}>
                  <BarChart
                    data={delayChartData}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#5B6E84" }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#5B6E84" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#D9E2EC",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <ReferenceLine y={0} stroke="#0F2544" strokeOpacity={0.35} />
                    <Bar
                      dataKey="Driver Delay (s)"
                      fill="#2563EB"
                      maxBarSize={56}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Passenger Wait (s)"
                      fill="#D97706"
                      maxBarSize={56}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ManifestCard>
        </div>

        {/* Multi-Perspective Performance Ledgers */}
        <ManifestCard>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "VENDORS", label: "Vendor SLA" },
                  { id: "DRIVERS", label: "Driver Punctuality" },
                  { id: "VEHICLES", label: "Vehicle Utilization" },
                  { id: "EMPLOYEES", label: "Cost & Attendance" },
                  { id: "NOSHOW_RISK", label: "No-Show & Delay Risk" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLedgerTab(tab.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    ledgerTab === tab.id
                      ? "bg-[#EFF6FF] text-[#1D4ED8]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {ledgerTab === "VENDORS" && (
            <DataLedger
              data={analytics?.vendorPerformance ?? []}
              columns={vendorColumns}
              isLoading={isLoading}
              emptyTitle="No vendor trips in selected range"
            />
          )}

          {ledgerTab === "DRIVERS" && (
            <DataLedger
              data={analytics?.driverPunctuality ?? []}
              columns={driverColumns}
              isLoading={isLoading}
              emptyTitle="No driver telemetry in selected range"
            />
          )}

          {ledgerTab === "VEHICLES" && (
            <DataLedger
              data={analytics?.vehicleUtilization ?? []}
              columns={vehicleColumns}
              isLoading={isLoading}
              emptyTitle="No vehicle utilization logs in selected range"
            />
          )}

          {ledgerTab === "EMPLOYEES" && (
            <DataLedger
              data={analytics?.employeeAttendanceCost ?? []}
              columns={employeeColumns}
              isLoading={isLoading}
              emptyTitle="No employee commute records in selected range"
              emptyDescription="Assigned and completed employee trips appear here with per-ride cost attribution."
            />
          )}

          {ledgerTab === "NOSHOW_RISK" && analytics && (
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-foreground">
                  Predictive Shift Delay Advisories
                </h3>
                {analytics.delayPredictions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No shift risk models available for this window yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {analytics.delayPredictions.map((pred) => (
                      <div
                        key={pred.shiftId}
                        className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {pred.shiftName}{" "}
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              ({pred.shiftTimeLocal})
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {pred.rationale}
                          </p>
                        </div>
                        <StatusBadge tone={statusToneFor(pred.riskLevel)} dot>
                          {pred.riskLevel} · {pred.riskScore}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-foreground">
                  Verified No-Show Breakdown (
                  {analytics.noShowBreakdown.totalNoShows} total ·{" "}
                  {analytics.noShowBreakdown.geofenceVerifiedPct}% geofenced)
                </h3>
                {analytics.noShowBreakdown.repeatOffenders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Zero verified no-show records in this period.
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {analytics.noShowBreakdown.repeatOffenders.map((emp) => (
                      <div
                        key={emp.employeeId}
                        className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-medium text-foreground">
                            {emp.employeeName}
                          </span>{" "}
                          <span className="font-mono text-muted-foreground">
                            ({emp.employeeCode})
                          </span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums text-foreground">
                          {emp.noShowCount} no-show(s) · {emp.overturnedCount}{" "}
                          overturned
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </ManifestCard>
      </div>

      {/* Guarded Read-Only Operations Query Assistant */}
      <SlideOverDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        title="Operations Query Assistant"
        subtitle="Strict read-only tenant analytics interpreter · Audit logged"
        width="lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2.5 text-xs text-[#1E3A8A]">
            <ShieldCheck className="size-4 shrink-0 mt-0.5 text-[#2563EB]" aria-hidden="true" />
            <span>
              Strictly read-only mode: answers operational questions from live
              Postgres telemetry without calling paid external APIs or executing
              state mutations.
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Suggested Operational Questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ASSISTANT_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setQuestion(prompt);
                    assistantMutation.mutate(prompt);
                  }}
                  className="rounded-md border border-border bg-[#F8FAFC] px-2.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-[#EFF6FF] hover:border-[#BFDBFE]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim().length >= 2) {
                assistantMutation.mutate(question);
              }
            }}
            className="space-y-2.5"
          >
            <div>
              <FieldLabel htmlFor={assistantInputId} required>
                Ask Operational Question
              </FieldLabel>
              <Input
                id={assistantInputId}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., Which vendor has the highest late-pickup frequency?"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={assistantMutation.isPending}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {assistantMutation.isPending ? "Querying..." : "Run Read-Only Query"}
            </Button>
          </form>

          {assistantResult && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge tone="cobalt" dot>
                  {assistantResult.intent}
                </StatusBadge>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {assistantResult.periodStart} to {assistantResult.periodEnd}
                </span>
              </div>

              <p className="text-sm font-medium text-foreground leading-relaxed">
                {assistantResult.answer}
              </p>

              {assistantResult.highlights.length > 0 && (
                <ul className="space-y-1.5 rounded-lg border border-border bg-[#F8FAFC] p-3 text-xs text-foreground">
                  {assistantResult.highlights.map((h, i) => (
                    <li key={i} className="font-mono tabular-nums">
                      • {h}
                    </li>
                  ))}
                </ul>
              )}

              {assistantResult.rows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <pre className="p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(assistantResult.rows.slice(0, 6), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}
