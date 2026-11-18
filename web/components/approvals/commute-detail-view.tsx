"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CarFront,
  Check,
  Clock,
  ExternalLink,
  History,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type {
  AutoAllocationResponse,
  OperatorCommuteDetailData,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { QueryErrorBanner } from "@/components/ui/empty-state";

type DateFilterBucket =
  | "ALL"
  | "PENDING_APPROVAL"
  | "NEEDS_ALLOCATION"
  | "DISPATCHED"
  | "CONFLICT";

export function CommuteDetailView() {
  const params = useParams<{ commuteKey: string }>();
  const searchParams = useSearchParams();
  const commuteKey = decodeURIComponent(params.commuteKey ?? "");
  const backHref = useMemo(() => {
    const rawReturn = searchParams.get("return");
    return rawReturn ? `/approvals?${rawReturn}` : "/approvals";
  }, [searchParams]);

  const queryClient = useQueryClient();
  const { identity, canApprove } = useDevSession();
  const { pushToast } = useToast();

  const remarksId = useId();
  const skipInfeasibleId = useId();
  const dateFilterId = useId();

  const [dateFilter, setDateFilter] = useState<DateFilterBucket>("ALL");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [skipInfeasible, setSkipInfeasible] = useState(true);
  const [allocPreview, setAllocPreview] = useState<AutoAllocationResponse | null>(
    null,
  );

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "admin-commute-detail",
      identity.orgId,
      identity.userId,
      identity.role,
      commuteKey,
    ],
    queryFn: () =>
      apiRequest<OperatorCommuteDetailData>(
        `/admin/commutes/${encodeURIComponent(commuteKey)}`,
        identity,
      ),
    enabled: Boolean(commuteKey),
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-commute-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-commutes"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    void queryClient.invalidateQueries({ queryKey: ["trips"] });
  };

  const approveDatesMutation = useMutation({
    mutationFn: (payload: {
      dates?: string[];
      bookingIds?: string[];
      decision: "APPROVED" | "REJECTED";
      skipInfeasible?: boolean;
      remarks?: string;
    }) =>
      apiRequest<{ decidedCount: number; decision: string }>(
        `/admin/commutes/${encodeURIComponent(commuteKey)}/approve-dates`,
        identity,
        {
          method: "POST",
          body: payload,
          idempotent: true,
        },
      ),
    onSuccess: (res) => {
      pushToast({
        tone: "success",
        title: `${res.decidedCount} reservation(s) ${res.decision.toLowerCase()}`,
        description:
          res.decision === "APPROVED"
            ? "Approved dates are now unlocked for driver & vehicle allocation."
            : "Rejected reservations updated and audit-logged.",
      });
      setSelectedDates([]);
      setRemarks("");
      invalidateAll();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Approval update failed",
        description: err.message,
      });
    },
  });

  const previewAllocMutation = useMutation({
    mutationFn: (date?: string) =>
      apiRequest<AutoAllocationResponse>(
        `/admin/commutes/${encodeURIComponent(commuteKey)}/allocate-dates`,
        identity,
        {
          method: "POST",
          idempotent: true,
          body: {
            date: date || undefined,
            publish: false,
            persistRun: true,
          },
        },
      ),
    onSuccess: (res) => {
      setAllocPreview(res);
      pushToast({
        tone: "info",
        title: "Allocation preview ready",
        description: `${res.summary.proposedTripsCount} trip proposal(s) generated strictly for this commute.`,
      });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Allocation preview failed",
        description: err.message,
      });
    },
  });

  const publishAllocMutation = useMutation({
    mutationFn: (payload: {
      date?: string;
      runId?: string;
      groups?: Array<{
        clusterId: string;
        travelDate: string;
        shiftId: string;
        officeId: string;
        direction: "LOGIN" | "LOGOUT";
        driverId: string;
        vehicleId: string;
        plannedStartAt: string;
        plannedEndAt: string;
        primaryLocalityId: string | null;
        rationale: Record<string, unknown>;
        stops: Array<{
          bookingId: string;
          sequenceNo: number;
          scheduledArrivalAt: string;
        }>;
      }>;
    }) =>
      apiRequest<{ publishedCount: number }>(
        `/admin/commutes/${encodeURIComponent(commuteKey)}/allocate-dates`,
        identity,
        {
          method: "POST",
          idempotent: true,
          body: {
            date: payload.date,
            publish: true,
            runId: payload.runId,
            groups: payload.groups,
          },
        },
      ),
    onSuccess: (res) => {
      setAllocPreview(null);
      pushToast({
        tone: "success",
        title: `${res.publishedCount} daily trip(s) published`,
        description:
          "Drivers received a consolidated schedule update without duplicate spam.",
      });
      invalidateAll();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Allocation publish blocked",
        description: err.message,
      });
    },
  });

  const filteredDates = useMemo(() => {
    const list = data?.dates ?? [];
    if (dateFilter === "ALL") return list;
    return list.filter((d) => {
      if (dateFilter === "DISPATCHED") {
        return (
          d.dateStatus === "DISPATCHED" ||
          d.dateStatus === "IN_PROGRESS" ||
          d.dateStatus === "COMPLETED"
        );
      }
      return d.dateStatus === dateFilter;
    });
  }, [data?.dates, dateFilter]);

  const toggleDate = (isoDate: string) => {
    setSelectedDates((prev) =>
      prev.includes(isoDate)
        ? prev.filter((d) => d !== isoDate)
        : [...prev, isoDate],
    );
  };

  const toggleAllVisiblePending = (checked: boolean) => {
    if (!checked) {
      setSelectedDates([]);
      return;
    }
    setSelectedDates(
      filteredDates
        .filter((d) => d.bookings.some((b) => b.status === "PENDING_APPROVAL"))
        .map((d) => d.travelDate),
    );
  };

  const commute = data?.commute;

  return (
    <AdminShell
      title={commute?.commuteName ?? "Commute Schedule & Approvals"}
      subtitle={
        commute
          ? `${commute.localityName} · ${commute.employeeCount} employee(s) · ${commute.scheduledDatesCount} scheduled date(s)`
          : `Loading focused commute plan ${commuteKey}...`
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={backHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Commutes
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
          {canApprove && commute && commute.counts.pendingApproval > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={approveDatesMutation.isPending}
              onClick={() =>
                approveDatesMutation.mutate({
                  decision: "APPROVED",
                  skipInfeasible,
                  remarks: remarks || "Bulk approved valid commute dates",
                })
              }
            >
              <Check className="size-3.5" aria-hidden="true" />
              Approve All Valid ({commute.counts.pendingApproval})
            </Button>
          )}
          {canApprove &&
            commute &&
            commute.counts.unallocatedApprovedCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={previewAllocMutation.isPending}
                onClick={() => previewAllocMutation.mutate(undefined)}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Preview Allocation
              </Button>
            )}
        </div>
      }
    >
      <div className="space-y-4 pb-16">
        {error && (
          <QueryErrorBanner
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {isLoading && (
          <ManifestCard className="p-6 text-sm text-muted-foreground">
            Loading focused commute plan, employees, driver suggestions, and
            date ledger...
          </ManifestCard>
        )}

        {data && commute && (
          <>
            {/* Focused Commute Metadata & Vehicle Capacity Requirements */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <ManifestCard className="xl:col-span-2 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      Commute ID: {commute.commuteKey}
                    </p>
                    <h2 className="text-base font-semibold text-foreground mt-0.5">
                      {commute.commuteName}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={statusToneFor(commute.direction)}>
                      {commute.direction === "LOGIN"
                        ? "Home -> Office"
                        : "Office -> Home"}
                    </StatusBadge>
                    <StatusBadge tone="slate">
                      {commute.recurrenceSummary}
                    </StatusBadge>
                    {commute.counts.infeasibleCount > 0 && (
                      <StatusBadge tone="crimson" dot>
                        {commute.counts.infeasibleCount} Timing Flag(s)
                      </StatusBadge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden="true" />
                      Corridor
                    </p>
                    <p className="text-xs font-semibold text-foreground mt-0.5 truncate">
                      {commute.localityName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {commute.officeName}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      Timing Policy
                    </p>
                    <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums">
                      {commute.timePreference === "ARRIVE_BY"
                        ? `Arrive by ${commute.requestedTimeLocal}`
                        : `Pickup ~${commute.requestedTimeLocal}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {commute.shiftName} ({commute.shiftTimeLocal})
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3" aria-hidden="true" />
                      Schedule Window
                    </p>
                    <p className="font-mono text-xs font-semibold text-foreground mt-0.5 tabular-nums">
                      {commute.startDate} -&gt; {commute.endDate}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {commute.selectedDaysOfWeek ?? "Scheduled days"} ·{" "}
                      {commute.scheduledDatesCount} day(s)
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Users className="size-3" aria-hidden="true" />
                      Date Counts
                    </p>
                    <p className="font-mono text-xs font-semibold text-foreground mt-0.5 tabular-nums">
                      {commute.counts.pendingApproval} pend ·{" "}
                      {commute.counts.unallocatedApprovedCount} unalloc
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {commute.counts.dispatched} dispatched ·{" "}
                      {commute.counts.expired} exp
                    </p>
                  </div>
                </div>
              </ManifestCard>

              <ManifestCard className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CarFront
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                    Peak Fleet & Locality Drivers
                  </h3>
                  <StatusBadge tone="cobalt" className="font-mono">
                    Peak {data.vehicleRequirements.peakDatePassengers} rider(s)
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recommended daily capacity (excl. driver):{" "}
                  <strong className="text-foreground">
                    {data.vehicleRequirements.recommendedSedans} Sedan (max 4)
                  </strong>{" "}
                  or{" "}
                  <strong className="text-foreground">
                    {data.vehicleRequirements.recommendedSuvs} SUV (max 6)
                  </strong>
                  .
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {data.driverSuggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No active drivers registered.
                    </p>
                  ) : (
                    data.driverSuggestions.slice(0, 6).map((drv) => (
                      <div
                        key={drv.driverId}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {drv.fullName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            Base: {drv.baseLocalityName} ·{" "}
                            {drv.vehicleRegistrationNo ?? "No cab"}{" "}
                            {drv.effectiveCapacity
                              ? `(${drv.effectiveCapacity} seats)`
                              : ""}
                          </p>
                        </div>
                        {drv.isLocalityMatch ? (
                          <StatusBadge tone="emerald">Zone Match</StatusBadge>
                        ) : (
                          <StatusBadge tone="slate">
                            {drv.availabilityStatus}
                          </StatusBadge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ManifestCard>
            </div>

            {/* Inline Scoped Auto-Allocation Preview Banner */}
            {allocPreview && (
              <ManifestCard className="p-4 border-primary/40 bg-primary/5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      Commute Allocation Plan Preview
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {allocPreview.summary.proposedTripsCount} daily trip
                      proposal(s) covering{" "}
                      {allocPreview.summary.allocatedBookingsCount} confirmed
                      booking(s) · {allocPreview.summary.unallocatedGroupsCount}{" "}
                      unallocated
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setAllocPreview(null)}
                    >
                      Dismiss
                    </Button>
                    {canApprove && allocPreview.proposals.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={publishAllocMutation.isPending}
                        onClick={() =>
                          publishAllocMutation.mutate({
                            runId: allocPreview.runId ?? undefined,
                            groups: allocPreview.proposals.map((p) => ({
                              clusterId: p.clusterId,
                              travelDate: p.travelDate,
                              shiftId: p.shiftId,
                              officeId: p.officeId,
                              direction: p.direction,
                              driverId: p.suggestedDriver.id,
                              vehicleId: p.suggestedVehicle.id,
                              plannedStartAt: p.plannedStartAt,
                              plannedEndAt: p.plannedEndAt,
                              primaryLocalityId: p.primaryLocalityId,
                              rationale: p.rationale,
                              stops: p.stops.map((s) => ({
                                bookingId: s.bookingId,
                                sequenceNo: s.sequenceNo,
                                scheduledArrivalAt: s.scheduledArrivalAt,
                              })),
                            })),
                          })
                        }
                      >
                        <Send className="size-3.5" aria-hidden="true" />
                        Confirm &amp; Publish ({allocPreview.proposals.length})
                      </Button>
                    )}
                  </div>
                </div>
                {allocPreview.unallocatedGroups.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                    {allocPreview.unallocatedGroups.map((u) => (
                      <p key={u.clusterId}>
                        <strong className="font-mono">{u.travelDate}:</strong>{" "}
                        {u.explanation} ({u.suggestedAction})
                      </p>
                    ))}
                  </div>
                )}
                {allocPreview.proposals.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {allocPreview.proposals.slice(0, 9).map((p) => (
                      <div
                        key={p.clusterId}
                        className="rounded-md border border-border bg-card p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-foreground tabular-nums">
                            {p.travelDate}
                          </span>
                          <StatusBadge tone="cobalt">
                            {p.seatCount} / {p.suggestedVehicle.effectiveCapacity}{" "}
                            seats
                          </StatusBadge>
                        </div>
                        <p className="font-medium text-foreground truncate">
                          {p.suggestedDriver.fullName} ·{" "}
                          {p.suggestedVehicle.registrationNo}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.rationale.localityMatchType} ·{" "}
                          {p.rationale.selectionReason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ManifestCard>
            )}

            {/* Focused Employees Roster (Scoped Strictly to This Commute) */}
            <ManifestCard>
              <ManifestHeader
                title={`Commute Employees Roster (${data.employees.length})`}
                description="Only employees enrolled in this commute plan are shown below"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-y border-border bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Employee</th>
                      <th className="px-4 py-2.5 font-medium">Pickup Stop</th>
                      <th className="px-4 py-2.5 font-medium">Schedule Plan</th>
                      <th className="px-4 py-2.5 font-medium">
                        Booking Summary
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.employees.map((emp) => (
                      <tr key={emp.employeeId} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">
                            {emp.employeeName}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {emp.employeeCode} · {emp.department}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-foreground">
                            {emp.pickupLocationName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                            {emp.localityName} · {emp.pickupAddress}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-foreground tabular-nums">
                          {emp.recurrenceType} · {emp.startDate} -&gt;{" "}
                          {emp.endDate}
                          {emp.selectedDaysOfWeek
                            ? ` (${emp.selectedDaysOfWeek})`
                            : ""}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {emp.counts.pendingApproval > 0 && (
                              <StatusBadge tone="amber">
                                {emp.counts.pendingApproval} pending
                              </StatusBadge>
                            )}
                            {emp.counts.approved > 0 && (
                              <StatusBadge tone="emerald">
                                {emp.counts.approved} approved
                              </StatusBadge>
                            )}
                            {emp.counts.dispatched > 0 && (
                              <StatusBadge tone="cobalt">
                                {emp.counts.dispatched} dispatched
                              </StatusBadge>
                            )}
                            {emp.counts.infeasible > 0 && (
                              <StatusBadge tone="crimson">
                                {emp.counts.infeasible} flagged
                              </StatusBadge>
                            )}
                            {emp.counts.expired > 0 && (
                              <StatusBadge tone="slate">
                                {emp.counts.expired} expired
                              </StatusBadge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ManifestCard>

            {/* Date-by-Date Schedule & Approval Workbench */}
            <ManifestCard>
              <ManifestHeader
                title={`Date-Specific Schedule & Allocation (${filteredDates.length})`}
                description="Approve feasible dates in bulk, inspect timing exceptions, or publish allocations per date"
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={skipInfeasibleId}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
                    >
                      <input
                        id={skipInfeasibleId}
                        type="checkbox"
                        checked={skipInfeasible}
                        onChange={(e) => setSkipInfeasible(e.target.checked)}
                        className="size-3.5 accent-primary"
                      />
                      Skip infeasible dates on bulk approve
                    </label>
                    <Select
                      id={dateFilterId}
                      aria-label="Filter commute dates"
                      value={dateFilter}
                      onChange={(e) => {
                        setDateFilter(e.target.value as DateFilterBucket);
                        setSelectedDates([]);
                      }}
                      className="h-8 text-xs w-44"
                    >
                      <option value="ALL">All scheduled dates</option>
                      <option value="PENDING_APPROVAL">Pending approval</option>
                      <option value="NEEDS_ALLOCATION">Needs allocation</option>
                      <option value="DISPATCHED">Dispatched / Active</option>
                      <option value="CONFLICT">Timing conflicts</option>
                    </Select>
                  </div>
                }
              />

              {canApprove && (
                <div className="border-y border-border bg-muted/20 px-4 py-2.5 flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        filteredDates.some((d) =>
                          d.bookings.some(
                            (b) => b.status === "PENDING_APPROVAL",
                          ),
                        ) &&
                        selectedDates.length > 0 &&
                        selectedDates.length ===
                          filteredDates.filter((d) =>
                            d.bookings.some(
                              (b) => b.status === "PENDING_APPROVAL",
                            ),
                          ).length
                      }
                      onChange={(e) => toggleAllVisiblePending(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    Select pending dates ({selectedDates.length} selected)
                  </label>
                  <Input
                    id={remarksId}
                    placeholder="Optional approval / rejection note..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="h-8 text-xs flex-1 min-w-[180px]"
                  />
                  {selectedDates.length > 0 && (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        disabled={approveDatesMutation.isPending}
                        onClick={() =>
                          approveDatesMutation.mutate({
                            dates: selectedDates,
                            decision: "REJECTED",
                            remarks: remarks || "Rejected selected dates",
                          })
                        }
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Reject Selected ({selectedDates.length})
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        disabled={approveDatesMutation.isPending}
                        onClick={() =>
                          approveDatesMutation.mutate({
                            dates: selectedDates,
                            decision: "APPROVED",
                            skipInfeasible,
                            remarks: remarks || undefined,
                          })
                        }
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Approve Selected ({selectedDates.length})
                      </Button>
                    </>
                  )}
                  {commute.counts.unallocatedApprovedCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={publishAllocMutation.isPending}
                      onClick={() => publishAllocMutation.mutate({})}
                    >
                      <UserCheck className="size-3.5" aria-hidden="true" />
                      Auto-Allocate &amp; Publish Approved
                    </Button>
                  )}
                </div>
              )}

              <div className="divide-y divide-border">
                {filteredDates.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">
                    No dates match the selected filter inside this commute.
                  </p>
                ) : (
                  filteredDates.map((d) => {
                    const hasPending = d.bookings.some(
                      (b) => b.status === "PENDING_APPROVAL",
                    );
                    const hasUnallocated = d.bookings.some(
                      (b) => b.status === "APPROVED" && !b.tripId,
                    );
                    const isChecked = selectedDates.includes(d.travelDate);

                    return (
                      <div
                        key={d.travelDate}
                        className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-muted/10"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {hasPending && canApprove ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${d.travelDate}`}
                              checked={isChecked}
                              onChange={() => toggleDate(d.travelDate)}
                              className="mt-1 size-4 accent-primary cursor-pointer"
                            />
                          ) : (
                            <span className="mt-1 size-4 shrink-0" />
                          )}
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                                {d.travelDate}
                              </span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {d.dayOfWeek}
                              </span>
                              <StatusBadge
                                tone={statusToneFor(d.dateStatus)}
                                dot
                              >
                                {d.dateStatus}
                              </StatusBadge>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {d.bookings.map((b) => (
                                <div
                                  key={b.bookingId}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                                >
                                  <span className="font-medium text-foreground">
                                    {b.employeeName}
                                  </span>
                                  <span className="text-muted-foreground">
                                    · {formatLocalTime(b.scheduledPickupAt)}
                                  </span>
                                  <StatusBadge tone={statusToneFor(b.status)}>
                                    {b.status}
                                  </StatusBadge>
                                  {b.isArriveByInfeasible && (
                                    <span
                                      title={
                                        b.feasibilityNote ??
                                        "Arrive-by cutoff conflict"
                                      }
                                      className="inline-flex items-center gap-0.5 text-rose-700 font-medium"
                                    >
                                      <AlertTriangle
                                        className="size-3"
                                        aria-hidden="true"
                                      />
                                      Infeasible
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {d.trips.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                {d.trips.map((t) => (
                                  <Link
                                    key={t.tripId}
                                    href={`/trips/${t.tripId}`}
                                    className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-[11px] text-blue-900 hover:bg-blue-100"
                                  >
                                    <span className="font-mono font-semibold">
                                      {t.tripCode}
                                    </span>
                                    <span>
                                      · {t.driverName ?? "Unassigned"} (
                                      {t.vehicleRegistrationNo ?? "TBD"})
                                    </span>
                                    <span>
                                      · {t.passengerCount}/
                                      {t.effectiveCapacity ?? "?"} seats
                                    </span>
                                    <StatusBadge tone={statusToneFor(t.status)}>
                                      {t.status}
                                    </StatusBadge>
                                    <ExternalLink
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {canApprove && (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {hasPending && (
                              <>
                                <Button
                                  type="button"
                                  size="xs"
                                  disabled={approveDatesMutation.isPending}
                                  onClick={() =>
                                    approveDatesMutation.mutate({
                                      dates: [d.travelDate],
                                      decision: "APPROVED",
                                      skipInfeasible: false,
                                      remarks: `Approved date ${d.travelDate}`,
                                    })
                                  }
                                >
                                  <Check
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  Approve Date
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="xs"
                                  disabled={approveDatesMutation.isPending}
                                  onClick={() =>
                                    approveDatesMutation.mutate({
                                      dates: [d.travelDate],
                                      decision: "REJECTED",
                                      remarks: `Rejected date ${d.travelDate}`,
                                    })
                                  }
                                >
                                  <X className="size-3.5" aria-hidden="true" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {hasUnallocated && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                disabled={publishAllocMutation.isPending}
                                onClick={() =>
                                  publishAllocMutation.mutate({
                                    date: d.travelDate,
                                  })
                                }
                              >
                                <Send
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Allocate &amp; Publish Date
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ManifestCard>

            {/* Scoped Audit Trail */}
            <ManifestCard>
              <ManifestHeader
                title="Commute Modification & Approval Audit History"
                description="Audit events filtered exclusively to reservations, recurring plans, and trips in this commute"
              />
              <div className="p-4">
                {data.auditHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No audit entries recorded yet for this commute.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {data.auditHistory.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <History
                            className="size-3.5 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="font-mono font-semibold text-foreground">
                            {log.action}
                          </span>
                          <StatusBadge tone="slate">{log.actorRole}</StatusBadge>
                          {log.reason && (
                            <span className="text-muted-foreground">
                              — {log.reason}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatLocalTime(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ManifestCard>
          </>
        )}
      </div>
    </AdminShell>
  );
}
