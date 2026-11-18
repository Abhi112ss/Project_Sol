"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import {
  ArrowRight,
  Ban,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  ListFilter,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { apiRequest, apiRequestWithMeta, formatLocalTime } from "@/lib/api";
import type {
  AdminCommuteBucket,
  ApprovalQueueItem,
  BookingStatus,
  EmployeeDetailData,
  EmployeeItem,
  OfficeItem,
  OperatorCommuteCardItem,
  ShiftItem,
  TripDirection,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved · Ready for dispatch",
  DISPATCHED: "Dispatched",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const BUCKET_LABELS: Record<AdminCommuteBucket, string> = {
  ALL: "All Commute Plans",
  NEEDS_ATTENTION: "Needs Attention (Pending / Unallocated / Flagged)",
  PENDING_APPROVAL: "Pending Approval",
  READY_TO_DISPATCH: "Ready to Dispatch",
  DISPATCHED: "Dispatched",
  EXPIRED: "Expired",
};

const BADGE_COPY: Record<OperatorCommuteCardItem["statusBadge"], string> = {
  NEEDS_ATTENTION: "Needs Attention",
  PENDING_APPROVAL: "Pending Approval",
  READY_TO_DISPATCH: "Awaiting Allocation",
  ALLOCATED: "Allocated",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
};

function getDefaultFutureBookingDate(): string {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(tomorrow);
}

export function ApprovalsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { identity, canApprove, activeOfficeId } = useDevSession();
  const { pushToast } = useToast();

  const searchInputId = useId();
  const bucketSelectId = useId();
  const dirSelectId = useId();
  const shiftSelectId = useId();

  // Read preserved navigation filters directly from URL query string
  const viewMode = searchParams.get("view") === "requests" ? "requests" : "commutes";
  const bucket = (searchParams.get("bucket") as AdminCommuteBucket) || "ALL";
  const searchParam = searchParams.get("q") ?? "";
  const directionParam = (searchParams.get("dir") as "" | TripDirection) || "";
  const shiftParam = searchParams.get("shift") ?? "";
  const pageParam = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [searchDraft, setSearchDraft] = useState(searchParam);

  // Flat individual-requests view state (optional legacy mode)
  const [statusFilter, setStatusFilter] = useState<BookingStatus>("PENDING_APPROVAL");
  const [travelDateFilter, setTravelDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [corridorFilter, setCorridorFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");

  // Create booking drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [bookingEmployeeId, setBookingEmployeeId] = useState("");
  const [bookingPickupId, setBookingPickupId] = useState("");
  const [bookingOfficeId, setBookingOfficeId] = useState("");
  const [bookingShiftId, setBookingShiftId] = useState("");
  const [bookingDate, setBookingDate] = useState(() =>
    getDefaultFutureBookingDate(),
  );
  const [bookingDirection, setBookingDirection] = useState<TripDirection>("LOGIN");
  const [bookingPickupLocal, setBookingPickupLocal] = useState(
    () => `${getDefaultFutureBookingDate()}T08:00`,
  );
  const [bookingNotes, setBookingNotes] = useState("");

  const effectiveOfficeId = activeOfficeId || undefined;

  const updateUrlParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/approvals?${qs}` : "/approvals", { scroll: false });
  };

  // Primary grouped commute workspace query (server-paginated & filtered)
  const {
    data: commutesPage,
    isLoading: commutesLoading,
    error: commutesError,
    refetch: refetchCommutes,
  } = useQuery({
    queryKey: [
      "admin-commutes",
      identity.orgId,
      identity.userId,
      identity.role,
      bucket,
      searchParam,
      directionParam,
      shiftParam,
      effectiveOfficeId,
      pageParam,
    ],
    queryFn: () =>
      apiRequestWithMeta<OperatorCommuteCardItem[]>("/admin/commutes", identity, {
        query: {
          bucket,
          search: searchParam || undefined,
          direction: directionParam || undefined,
          shiftId: shiftParam || undefined,
          officeId: effectiveOfficeId,
          page: pageParam,
          limit: 12,
        },
      }),
    enabled: viewMode === "commutes",
  });

  // Secondary individual booking queue (only loaded when toggled to Individual Dates view)
  const {
    data: queue = [],
    isLoading: queueLoading,
    error: queueError,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: [
      "approvals-queue",
      identity.orgId,
      identity.userId,
      identity.role,
      statusFilter,
      travelDateFilter,
      directionParam,
      shiftParam,
      effectiveOfficeId,
      departmentFilter,
      corridorFilter,
    ],
    queryFn: () =>
      apiRequest<ApprovalQueueItem[]>("/admin/approvals/queue", identity, {
        query: {
          status: statusFilter,
          travelDate: travelDateFilter || undefined,
          direction: directionParam || undefined,
          shiftId: shiftParam || undefined,
          officeId: effectiveOfficeId,
          department: departmentFilter || undefined,
          corridorTag: corridorFilter || undefined,
        },
      }),
    enabled: viewMode === "requests",
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<ShiftItem[]>("/admin/shifts", identity),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ["offices", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OfficeItem[]>("/admin/offices", identity),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-select", identity.orgId, identity.userId, identity.role],
    queryFn: () =>
      apiRequest<EmployeeItem[]>("/admin/employees", identity, {
        query: { page: 1, limit: 100 },
      }),
    enabled: createOpen,
  });

  const { data: employeeDetail } = useQuery({
    queryKey: [
      "employee-detail-booking",
      identity.orgId,
      identity.userId,
      bookingEmployeeId,
    ],
    queryFn: () =>
      apiRequest<EmployeeDetailData>(
        `/admin/employees/${bookingEmployeeId}`,
        identity,
      ),
    enabled: Boolean(bookingEmployeeId) && createOpen,
  });

  const bulkDecideMutation = useMutation({
    mutationFn: (payload: {
      bookingIds: string[];
      decision: "APPROVED" | "REJECTED";
      remarks?: string;
    }) =>
      apiRequest<{ decidedCount: number; decision: string }>(
        "/admin/approvals/bulk-decide",
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
        title: `${res.decidedCount} booking(s) ${res.decision.toLowerCase()}`,
        description:
          res.decision === "APPROVED"
            ? "Requests are now unlocked in the Dispatch Workbench."
            : "Decision recorded in immutable audit logs.",
      });
      setSelectedIds([]);
      setRemarks("");
      void queryClient.invalidateQueries({ queryKey: ["approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-commutes"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Approval update failed",
        description: err.message,
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      apiRequest(`/admin/bookings/${bookingId}/cancel`, identity, {
        method: "POST",
        body: { reason },
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({
        tone: "info",
        title: "Booking cancelled",
        description: "Employee schedule updated before dispatch.",
      });
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ["approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-commutes"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Cancellation blocked",
        description: err.message,
      });
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: (payload: {
      employeeId: string;
      shiftId: string;
      officeId: string;
      pickupLocationId: string;
      travelDate: string;
      direction: TripDirection;
      scheduledPickupAt: string;
      notes?: string;
    }) =>
      apiRequest("/admin/bookings", identity, {
        method: "POST",
        body: payload,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Transport booking created",
        description: "Grouped into matching commute plan for operator review.",
      });
      setCreateOpen(false);
      setBookingNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admin-commutes"] });
      void queryClient.invalidateQueries({ queryKey: ["approvals-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Could not create booking",
        description: err.message,
      });
    },
  });

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(queue.map((item) => item.bookingId));
  };

  const toggleOne = (bookingId: string) => {
    setSelectedIds((prev) =>
      prev.includes(bookingId)
        ? prev.filter((id) => id !== bookingId)
        : [...prev, bookingId],
    );
  };

  const columns = useMemo<LegacyColumnDef<ApprovalQueueItem, unknown>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            id="select-all-approvals"
            name="selectAllApprovals"
            type="checkbox"
            aria-label="Select all visible requests"
            className="size-4 rounded border-input accent-primary cursor-pointer"
            checked={queue.length > 0 && selectedIds.length === queue.length}
            onChange={(e) => toggleAll(e.target.checked)}
          />
        ),
        cell: ({ row }) => {
          const item = row.original;
          const isChecked = selectedIds.includes(item.bookingId);
          return (
            <input
              id={`select-booking-${item.bookingId}`}
              name="selectedBookings"
              type="checkbox"
              aria-label={`Select ${item.employeeName}`}
              className="size-4 rounded border-input accent-primary cursor-pointer"
              checked={isChecked}
              onChange={() => toggleOne(item.bookingId)}
            />
          );
        },
      },
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="min-w-[160px]">
              <p className="font-medium text-foreground">{item.employeeName}</p>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {item.employeeCode} · {item.department}
              </p>
            </div>
          );
        },
      },
      {
        id: "shift",
        header: "Travel Date & Shift",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                  {item.travelDate}
                </span>
                <StatusBadge tone={statusToneFor(item.direction)}>
                  {item.direction}
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.shiftName} ({item.shiftTimeLocal}) · {item.officeName}
              </p>
            </div>
          );
        },
      },
      {
        id: "corridor",
        header: "Pickup Corridor & Stop",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="max-w-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-xs text-foreground">
                  {item.pickupLocationName}
                </span>
                {item.corridorTag && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {item.corridorTag}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {item.pickupAddress}
              </p>
            </div>
          );
        },
      },
      {
        id: "pickupAt",
        header: "Scheduled Pickup",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground tabular-nums">
            {formatLocalTime(row.original.scheduledPickupAt)}
          </span>
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
        cell: ({ row }) => {
          const item = row.original;
          if (
            !canApprove ||
            (item.status !== "PENDING_APPROVAL" && item.status !== "APPROVED")
          ) {
            return null;
          }
          return (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                cancelMutation.mutate({
                  bookingId: item.bookingId,
                  reason: "Cancelled by operations from approval queue",
                })
              }
              disabled={cancelMutation.isPending}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              Cancel
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, selectedIds, canApprove, cancelMutation.isPending],
  );

  const handleOpenCreate = () => {
    setCreateOpen(true);
    if (!bookingOfficeId && offices[0]) setBookingOfficeId(offices[0].id);
    if (!bookingShiftId && shifts[0]) setBookingShiftId(shifts[0].id);
  };

  const handleEmployeePicked = (empId: string) => {
    setBookingEmployeeId(empId);
    setBookingPickupId("");
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      setBookingOfficeId(emp.officeId);
      if (emp.defaultShiftId) {
        setBookingShiftId(emp.defaultShiftId);
      }
    }
  };

  const submitNewBooking = (event: React.FormEvent) => {
    event.preventDefault();
    const resolvedPickupId =
      bookingPickupId || employeeDetail?.locations[0]?.id || "";
    if (!bookingEmployeeId || !bookingShiftId || !bookingOfficeId || !resolvedPickupId) {
      pushToast({
        tone: "error",
        title: "Missing booking fields",
        description:
          "Select an employee with a saved pickup location, shift, and office.",
      });
      return;
    }
    const isoPickup = new Date(`${bookingPickupLocal}:00+05:30`).toISOString();
    createBookingMutation.mutate({
      employeeId: bookingEmployeeId,
      shiftId: bookingShiftId,
      officeId: bookingOfficeId,
      pickupLocationId: resolvedPickupId,
      travelDate: bookingDate,
      direction: bookingDirection,
      scheduledPickupAt: isoPickup,
      notes: bookingNotes || undefined,
    });
  };

  const commuteItems = commutesPage?.data ?? [];
  const commutePagination = commutesPage?.pagination;
  const activeQuerySuffix = searchParams.toString();

  return (
    <AdminShell
      title="Commute Approvals Workspace"
      subtitle="Review and approve recurring employee commutes cleanly by corridor & schedule without daily date clutter"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            <Button
              type="button"
              variant={viewMode === "commutes" ? "default" : "ghost"}
              size="xs"
              onClick={() => updateUrlParams({ view: undefined, page: "1" })}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              Commutes
            </Button>
            <Button
              type="button"
              variant={viewMode === "requests" ? "default" : "ghost"}
              size="xs"
              onClick={() => updateUrlParams({ view: "requests" })}
            >
              <ListFilter className="size-3.5" aria-hidden="true" />
              Individual Dates
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              viewMode === "commutes"
                ? void refetchCommutes()
                : void refetchQueue()
            }
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
          {canApprove && (
            <Button type="button" size="sm" onClick={handleOpenCreate}>
              <Plus className="size-3.5" aria-hidden="true" />
              New Booking
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pb-20">
        {viewMode === "commutes" ? (
          <>
            {commutesError && (
              <QueryErrorBanner
                message={commutesError.message}
                onRetry={() => void refetchCommutes()}
              />
            )}

            {/* Commute Search & Filter Bar */}
            <ManifestCard className="p-3.5">
              <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateUrlParams({
                    q: searchDraft.trim() || undefined,
                    page: "1",
                  });
                }}
              >
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor={searchInputId}>
                    Search Commute, Locality or Employee
                  </FieldLabel>
                  <div className="flex gap-1.5">
                    <Input
                      id={searchInputId}
                      placeholder="e.g. Chinthal, Kukatpally, Aarav..."
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                    />
                    <Button type="submit" variant="outline" size="default">
                      <Search className="size-3.5" aria-hidden="true" />
                      Search
                    </Button>
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor={bucketSelectId}>
                    Workflow Bucket
                  </FieldLabel>
                  <Select
                    id={bucketSelectId}
                    value={bucket}
                    onChange={(e) =>
                      updateUrlParams({
                        bucket:
                          e.target.value === "ALL" ? undefined : e.target.value,
                        page: "1",
                      })
                    }
                  >
                    {(Object.keys(BUCKET_LABELS) as AdminCommuteBucket[]).map(
                      (b) => (
                        <option key={b} value={b}>
                          {BUCKET_LABELS[b]}
                        </option>
                      ),
                    )}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor={dirSelectId}>Direction</FieldLabel>
                  <Select
                    id={dirSelectId}
                    value={directionParam}
                    onChange={(e) =>
                      updateUrlParams({
                        dir: e.target.value || undefined,
                        page: "1",
                      })
                    }
                  >
                    <option value="">All directions</option>
                    <option value="LOGIN">Home -&gt; Office</option>
                    <option value="LOGOUT">Office -&gt; Home</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor={shiftSelectId}>Shift Window</FieldLabel>
                  <Select
                    id={shiftSelectId}
                    value={shiftParam}
                    onChange={(e) =>
                      updateUrlParams({
                        shift: e.target.value || undefined,
                        page: "1",
                      })
                    }
                  >
                    <option value="">All shifts</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.shiftTimeLocal} ({s.direction})
                      </option>
                    ))}
                  </Select>
                </div>
              </form>
            </ManifestCard>

            {/* Compact Commute Plan Cards */}
            <ManifestCard>
              <ManifestHeader
                title={`Commute Plans · ${BUCKET_LABELS[bucket]}`}
                description={
                  commutePagination
                    ? `Showing ${commuteItems.length} of ${commutePagination.total} grouped commute plan(s) — open any commute to inspect all employees & dates in isolation`
                    : "Grouped recurring and scheduled commute plans"
                }
              />
              {commutesLoading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Loading grouped commute schedules...
                </div>
              ) : commuteItems.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    No commute plans match the current filters
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Switch the workflow bucket, clear search, or create a new
                    employee booking.
                  </p>
                  {canApprove && (
                    <Button type="button" size="sm" onClick={handleOpenCreate}>
                      Create Employee Booking
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {commuteItems.map((item) => {
                    const detailHref = activeQuerySuffix
                      ? `/approvals/${encodeURIComponent(item.commuteKey)}?return=${encodeURIComponent(activeQuerySuffix)}`
                      : `/approvals/${encodeURIComponent(item.commuteKey)}`;

                    return (
                      <div
                        key={item.commuteKey}
                        className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-muted/15"
                      >
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={detailHref}
                              className="text-sm font-semibold text-foreground hover:text-primary hover:underline truncate"
                            >
                              {item.commuteName}
                            </Link>
                            <StatusBadge
                              tone={statusToneFor(item.statusBadge)}
                              dot
                            >
                              {BADGE_COPY[item.statusBadge]}
                            </StatusBadge>
                            <StatusBadge tone="slate">
                              {item.recurrenceSummary}
                            </StatusBadge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 text-foreground font-medium">
                              <MapPin
                                className="size-3.5 text-primary"
                                aria-hidden="true"
                              />
                              {item.direction === "LOGIN"
                                ? `${item.localityName} -> ${item.officeName}`
                                : `${item.officeName} -> ${item.localityName}`}
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock className="size-3.5" aria-hidden="true" />
                              {item.timePreference === "ARRIVE_BY"
                                ? `Arrive by ${item.requestedTimeLocal}`
                                : `Pickup ~${item.requestedTimeLocal}`}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
                              <Calendar
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              {item.startDate} -&gt; {item.endDate} (
                              {item.scheduledDatesCount} dates)
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users className="size-3.5" aria-hidden="true" />
                              {item.employeeCount} employee(s)
                              {item.employeePreview.length > 0
                                ? ` (${item.employeePreview.slice(0, 2).join(", ")}${item.employeeCount > 2 ? "..." : ""})`
                                : ""}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {item.counts.pendingApproval > 0 && (
                              <StatusBadge tone="amber">
                                {item.counts.pendingApproval} pending approval
                              </StatusBadge>
                            )}
                            {item.counts.unallocatedApprovedCount > 0 && (
                              <StatusBadge tone="amber">
                                {item.counts.unallocatedApprovedCount} awaiting
                                cab
                              </StatusBadge>
                            )}
                            {item.counts.dispatched > 0 && (
                              <StatusBadge tone="cobalt">
                                {item.counts.dispatched} dispatched
                              </StatusBadge>
                            )}
                            {item.counts.infeasibleCount > 0 && (
                              <StatusBadge tone="crimson">
                                {item.counts.infeasibleCount} timing flag(s)
                              </StatusBadge>
                            )}
                            {item.counts.expired > 0 && (
                              <StatusBadge tone="slate">
                                {item.counts.expired} expired
                              </StatusBadge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href={detailHref}
                            className={buttonVariants({
                              variant:
                                item.attentionCount > 0 ? "default" : "outline",
                              size: "sm",
                            })}
                          >
                            Open Commute
                            <ArrowRight
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Server-Side Pagination Footer */}
              {commutePagination && commutePagination.totalPages > 1 && (
                <div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    Page {commutePagination.page} of{" "}
                    {commutePagination.totalPages} · {commutePagination.total}{" "}
                    total commute(s)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={commutePagination.page <= 1}
                      onClick={() =>
                        updateUrlParams({
                          page: String(Math.max(1, commutePagination.page - 1)),
                        })
                      }
                    >
                      <ChevronLeft className="size-3.5" aria-hidden="true" />
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={
                        commutePagination.page >= commutePagination.totalPages
                      }
                      onClick={() =>
                        updateUrlParams({
                          page: String(commutePagination.page + 1),
                        })
                      }
                    >
                      Next
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </ManifestCard>
          </>
        ) : (
          <>
            {queueError && (
              <QueryErrorBanner
                message={queueError.message}
                onRetry={() => void refetchQueue()}
              />
            )}

            {/* Individual Date Filter Bar (Secondary Mode) */}
            <ManifestCard className="p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <div>
                  <FieldLabel htmlFor="apr-status">Queue Status</FieldLabel>
                  <Select
                    id="apr-status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as BookingStatus);
                      setSelectedIds([]);
                    }}
                  >
                    <option value="PENDING_APPROVAL">Pending Approval</option>
                    <option value="APPROVED">Approved (Dispatch Ready)</option>
                    <option value="DISPATCHED">Dispatched</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="EXPIRED">Expired</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="apr-date">Travel Date</FieldLabel>
                  <Input
                    id="apr-date"
                    type="date"
                    value={travelDateFilter}
                    onChange={(e) => setTravelDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="apr-dir">Direction</FieldLabel>
                  <Select
                    id="apr-dir"
                    value={directionParam}
                    onChange={(e) =>
                      updateUrlParams({ dir: e.target.value || undefined })
                    }
                  >
                    <option value="">All directions</option>
                    <option value="LOGIN">LOGIN (Pickup to Campus)</option>
                    <option value="LOGOUT">LOGOUT (Campus Drop)</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="apr-shift">Shift Window</FieldLabel>
                  <Select
                    id="apr-shift"
                    value={shiftParam}
                    onChange={(e) =>
                      updateUrlParams({ shift: e.target.value || undefined })
                    }
                  >
                    <option value="">All shifts</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.shiftTimeLocal} ({s.direction})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="apr-dept">Department</FieldLabel>
                  <Input
                    id="apr-dept"
                    placeholder="e.g. Engineering"
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="apr-corridor">Corridor Tag</FieldLabel>
                  <Input
                    id="apr-corridor"
                    placeholder="Madhapur, Miyapur..."
                    value={corridorFilter}
                    onChange={(e) => setCorridorFilter(e.target.value)}
                  />
                </div>
              </div>
            </ManifestCard>

            <ManifestCard>
              <ManifestHeader
                title={`Booking queue · ${STATUS_LABELS[statusFilter]}`}
                description={`${queue.length} booking request(s) matching current bridge filters`}
                actions={
                  travelDateFilter && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setTravelDateFilter("")}
                    >
                      Clear date filter
                    </Button>
                  )
                }
              />
              <DataLedger
                data={queue}
                columns={columns}
                isLoading={queueLoading}
                emptyTitle="No bookings in this status bucket"
                emptyDescription="Switch Queue Status or return to Commutes view."
              />
            </ManifestCard>
          </>
        )}
      </div>

      {/* Sticky Bulk Action Bar for Legacy Requests Mode */}
      {viewMode === "requests" &&
        selectedIds.length > 0 &&
        statusFilter === "PENDING_APPROVAL" && (
          <div className="fixed bottom-4 left-1/2 lg:left-[calc(50%+112px)] z-40 w-[min(760px,calc(100vw-2rem))] lg:w-[min(760px,calc(100vw-224px-3rem))] -translate-x-1/2 rounded-xl harbor-floating-glass p-3 shadow-[0_12px_32px_rgba(15,37,68,0.14)]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge tone="cobalt" className="font-mono">
                  {selectedIds.length} selected
                </StatusBadge>
              </div>
              <Input
                id="bulk-decision-remarks"
                name="bulkDecisionRemarks"
                aria-label="Approval or rejection remarks"
                placeholder="Optional approval / rejection remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="h-8 flex-1 min-w-[180px] text-xs"
              />
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={!canApprove || bulkDecideMutation.isPending}
                  onClick={() =>
                    bulkDecideMutation.mutate({
                      bookingIds: selectedIds,
                      decision: "REJECTED",
                      remarks: remarks || "Rejected during queue review",
                    })
                  }
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canApprove || bulkDecideMutation.isPending}
                  onClick={() =>
                    bulkDecideMutation.mutate({
                      bookingIds: selectedIds,
                      decision: "APPROVED",
                      remarks: remarks || undefined,
                    })
                  }
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Approve Selected
                </Button>
              </div>
            </div>
          </div>
        )}

      {/* New Booking Drawer */}
      <SlideOverDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule Employee Transport Booking"
        subtitle="Creates a PENDING_APPROVAL shift booking grouped automatically into its commute plan"
      >
        <form
          id="new-booking-form"
          onSubmit={submitNewBooking}
          className="space-y-4"
        >
          <div>
            <FieldLabel htmlFor="bk-emp" required>
              Employee
            </FieldLabel>
            <Select
              id="bk-emp"
              required
              value={bookingEmployeeId}
              onChange={(e) => handleEmployeePicked(e.target.value)}
            >
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employeeCode} · {emp.fullName} ({emp.department})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <FieldLabel htmlFor="bk-loc" required>
              Saved Pickup Location
            </FieldLabel>
            <Select
              id="bk-loc"
              required
              value={bookingPickupId || employeeDetail?.locations[0]?.id || ""}
              onChange={(e) => setBookingPickupId(e.target.value)}
              disabled={!bookingEmployeeId}
            >
              <option value="">
                {bookingEmployeeId
                  ? "Select verified pickup point..."
                  : "Pick an employee first"}
              </option>
              {employeeDetail?.locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.locationName} ({loc.corridorTag ?? "Hyderabad"})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="bk-office" required>
                Campus Office
              </FieldLabel>
              <Select
                id="bk-office"
                required
                value={bookingOfficeId}
                onChange={(e) => setBookingOfficeId(e.target.value)}
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="bk-shift" required>
                Shift
              </FieldLabel>
              <Select
                id="bk-shift"
                required
                value={bookingShiftId}
                onChange={(e) => setBookingShiftId(e.target.value)}
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.shiftTimeLocal} ({s.direction})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="bk-date" required>
                Travel Date
              </FieldLabel>
              <Input
                id="bk-date"
                type="date"
                required
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="bk-dir" required>
                Direction
              </FieldLabel>
              <Select
                id="bk-dir"
                value={bookingDirection}
                onChange={(e) =>
                  setBookingDirection(e.target.value as TripDirection)
                }
              >
                <option value="LOGIN">LOGIN (Home to Campus)</option>
                <option value="LOGOUT">LOGOUT (Campus to Home)</option>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="bk-time" required>
              Scheduled Pickup (IST)
            </FieldLabel>
            <Input
              id="bk-time"
              type="datetime-local"
              required
              value={bookingPickupLocal}
              onChange={(e) => setBookingPickupLocal(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel htmlFor="bk-notes">Dispatcher Notes</FieldLabel>
            <Input
              id="bk-notes"
              placeholder="Optional landmark or gate note..."
              value={bookingNotes}
              onChange={(e) => setBookingNotes(e.target.value)}
            />
          </div>
        </form>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-booking-form"
            disabled={createBookingMutation.isPending}
          >
            Submit Booking Request
          </Button>
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}
