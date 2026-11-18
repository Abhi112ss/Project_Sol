"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CarFront,
  ExternalLink,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type {
  ApprovalQueueItem,
  AutoAllocationProposal,
  DriverItem,
  ShiftItem,
  TripDirection,
  UnallocatedGroupItem,
  VehicleItem,
  VrptwClusterRecommendation,
  VrptwRecommendationsResponse,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { AutoAllocationPanel } from "@/components/dispatch/auto-allocation-panel";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { EmptyState, QueryErrorBanner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface ManifestStop {
  booking: ApprovalQueueItem;
  scheduledArrivalLocal: string;
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "2026-11-17T08:00";
  // Render deterministic Asia/Kolkata wall clock for input[type="datetime-local"]
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function DispatchView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { identity, canApprove, activeOfficeId } = useDevSession();
  const { pushToast } = useToast();

  const [corridorFilter, setCorridorFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"" | TripDirection>("");

  const [manifestStops, setManifestStops] = useState<ManifestStop[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [plannedStartLocal, setPlannedStartLocal] = useState("2026-11-17T07:50");
  const [vrptwOpen, setVrptwOpen] = useState(false);

  const {
    data: approvedBookings = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "dispatch-approved-queue",
      identity.orgId,
      identity.userId,
      identity.role,
      shiftFilter,
      directionFilter,
      activeOfficeId,
      corridorFilter,
    ],
    queryFn: () =>
      apiRequest<ApprovalQueueItem[]>("/admin/approvals/queue", identity, {
        query: {
          status: "APPROVED",
          shiftId: shiftFilter || undefined,
          direction: directionFilter || undefined,
          officeId: activeOfficeId || undefined,
          corridorTag: corridorFilter || undefined,
        },
      }),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<DriverItem[]>("/admin/drivers", identity),
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VehicleItem[]>("/admin/vehicles", identity),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<ShiftItem[]>("/admin/shifts", identity),
  });

  const {
    data: vrptwData,
    isFetching: vrptwLoading,
    refetch: refetchVrptw,
  } = useQuery({
    queryKey: [
      "dispatch-vrptw",
      identity.orgId,
      shiftFilter,
      directionFilter,
      activeOfficeId,
    ],
    enabled: vrptwOpen,
    queryFn: () =>
      apiRequest<VrptwRecommendationsResponse>(
        "/admin/routing/recommendations",
        identity,
        {
          query: {
            shiftId: shiftFilter || undefined,
            direction: directionFilter || undefined,
            officeId: activeOfficeId || undefined,
          },
        },
      ),
  });

  const applyClusterToManifest = (cluster: VrptwClusterRecommendation) => {
    const queueMap = new Map(
      approvedBookings.map((item) => [item.bookingId, item]),
    );
    const nextStops: ManifestStop[] = cluster.stops.map((s) => {
      const existing = queueMap.get(s.bookingId);
      const bookingItem: ApprovalQueueItem = existing ?? {
        bookingId: s.bookingId,
        travelDate: cluster.travelDate,
        direction: cluster.direction,
        scheduledPickupAt: s.scheduledArrivalAt,
        status: "APPROVED",
        employeeId: s.employeeId,
        employeeCode: s.employeeCode,
        employeeName: s.employeeName,
        employeePhone: "",
        department: s.department,
        shiftId: cluster.shiftId,
        shiftName: cluster.shiftName,
        shiftTimeLocal: cluster.shiftTimeLocal,
        officeId: cluster.officeId,
        officeName: cluster.officeName,
        pickupLocationId: s.bookingId,
        pickupLocationName: s.pickupLocationName,
        pickupAddress: s.address,
        corridorTag: s.corridorTag,
        latitude: s.latitude,
        longitude: s.longitude,
      };
      return {
        booking: bookingItem,
        scheduledArrivalLocal: toDatetimeLocalValue(s.scheduledArrivalAt),
      };
    });

    setManifestStops(nextStops);
    if (cluster.recommendedVehicle) {
      setSelectedVehicleId(cluster.recommendedVehicle.id);
    }
    if (cluster.recommendedDriver) {
      setSelectedDriverId(cluster.recommendedDriver.id);
    }
    setPlannedStartLocal(toDatetimeLocalValue(cluster.plannedStartAt));
    setVrptwOpen(false);
    pushToast({
      tone: "success",
      title: `Loaded ${cluster.clusterId}`,
      description: `${cluster.stops.length} stop(s) populated for human review before publishing.`,
    });
  };

  const applyAllocationProposalToManifest = (proposal: AutoAllocationProposal) => {
    const queueMap = new Map(approvedBookings.map((item) => [item.bookingId, item]));
    const nextStops: ManifestStop[] = proposal.stops.map((s) => {
      const existing = queueMap.get(s.bookingId);
      const bookingItem: ApprovalQueueItem = existing ?? {
        bookingId: s.bookingId,
        travelDate: proposal.travelDate,
        direction: proposal.direction,
        timePreference: s.timePreference,
        requestedTimeLocal: s.requestedTimeLocal,
        scheduledPickupAt: s.scheduledArrivalAt,
        isArriveByInfeasible: s.isArriveByInfeasible,
        status: "APPROVED",
        employeeId: s.employeeId,
        employeeCode: s.employeeCode,
        employeeName: s.employeeName,
        employeePhone: "",
        department: s.department,
        shiftId: proposal.shiftId,
        shiftName: proposal.shiftName,
        shiftTimeLocal: "",
        officeId: proposal.officeId,
        officeName: proposal.officeName,
        pickupLocationId: s.bookingId,
        pickupLocationName: s.pickupLocationName,
        pickupAddress: s.address,
        corridorTag: s.localityName,
        normalizedLocality: s.localityName,
        latitude: s.latitude,
        longitude: s.longitude,
      };
      return {
        booking: bookingItem,
        scheduledArrivalLocal: toDatetimeLocalValue(s.scheduledArrivalAt),
      };
    });

    setManifestStops(nextStops);
    setSelectedVehicleId(proposal.suggestedVehicle.id);
    setSelectedDriverId(proposal.suggestedDriver.id);
    setPlannedStartLocal(toDatetimeLocalValue(proposal.plannedStartAt));
    pushToast({
      tone: "info",
      title: `Loaded ${proposal.clusterId} into workbench`,
      description: "Adjust stops, vehicle, or driver below before manual publish.",
    });
  };

  const applyUnallocatedToManifest = (group: UnallocatedGroupItem) => {
    const queueMap = new Map(approvedBookings.map((item) => [item.bookingId, item]));
    const nextStops: ManifestStop[] = [];
    for (const item of group.bookings) {
      const booking = queueMap.get(item.bookingId);
      if (booking) {
        nextStops.push({
          booking,
          scheduledArrivalLocal: toDatetimeLocalValue(item.scheduledPickupAt),
        });
      }
    }
    if (nextStops.length > 0) {
      setManifestStops(nextStops);
      setPlannedStartLocal(toDatetimeLocalValue(group.plannedStartAt));
      pushToast({
        tone: "info",
        title: `Loaded unallocated ${group.clusterId}`,
        description: "Assign an available chauffeur and compatible cab below.",
      });
    }
  };

  const publishMutation = useMutation({
    mutationFn: (payload: {
      travelDate: string;
      shiftId: string;
      officeId: string;
      direction: TripDirection;
      driverId: string;
      vehicleId: string;
      plannedStartAt: string;
      stops: Array<{
        bookingId: string;
        sequenceNo: number;
        scheduledArrivalAt: string;
      }>;
    }) =>
      apiRequest<{ trip: { id: string; tripCode: string } }>(
        "/admin/dispatch/manual",
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
        title: `Trip ${res.trip.tripCode} published`,
        description: "Driver & office stops created with Socket.IO broadcast.",
      });
      setManifestStops([]);
      void queryClient.invalidateQueries({ queryKey: ["dispatch-approved-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
      void queryClient.invalidateQueries({ queryKey: ["trips-list"] });
      router.push(`/trips/${res.trip.id}`);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Dispatch validation error",
        description: err.message,
      });
    },
  });

  const manifestBookingIds = useMemo(
    () => new Set(manifestStops.map((s) => s.booking.bookingId)),
    [manifestStops],
  );

  const anchorBooking = manifestStops[0]?.booking ?? null;
  const activeDrivers = drivers.filter((d) => !d.isSuspended);
  const availableVehicles = vehicles.filter((v) => v.isActive);
  const selectedVehicle = availableVehicles.find((v) => v.id === selectedVehicleId);
  const rawCapacity = selectedVehicle?.seatingCapacity ?? 4;
  const selectedCapacity =
    selectedVehicle?.vehicleType === "SEDAN" ||
    selectedVehicle?.vehicleType === "EV_SEDAN"
      ? Math.min(rawCapacity, 4)
      : selectedVehicle?.vehicleType === "SUV"
        ? Math.min(rawCapacity, 6)
        : rawCapacity;
  const capacityExceeded = manifestStops.length > selectedCapacity;

  const isCompatibleWithAnchor = (candidate: ApprovalQueueItem) => {
    if (!anchorBooking) return true;
    return (
      candidate.officeId === anchorBooking.officeId &&
      candidate.shiftId === anchorBooking.shiftId &&
      candidate.travelDate === anchorBooking.travelDate &&
      candidate.direction === anchorBooking.direction
    );
  };

  const addStop = (booking: ApprovalQueueItem) => {
    if (manifestBookingIds.has(booking.bookingId)) return;
    if (!isCompatibleWithAnchor(booking)) {
      pushToast({
        tone: "error",
        title: "Incompatible shift or direction",
        description:
          "All riders on one cab trip must share the same campus office, travel date, shift, and direction.",
      });
      return;
    }
    setManifestStops((prev) => [
      ...prev,
      {
        booking,
        scheduledArrivalLocal: toDatetimeLocalValue(booking.scheduledPickupAt),
      },
    ]);
    if (!selectedVehicleId && availableVehicles[0]) {
      setSelectedVehicleId(availableVehicles[0].id);
    }
    if (!selectedDriverId && activeDrivers[0]) {
      setSelectedDriverId(activeDrivers[0].id);
    }
  };

  const removeStop = (bookingId: string) => {
    setManifestStops((prev) =>
      prev.filter((s) => s.booking.bookingId !== bookingId),
    );
  };

  const moveStop = (index: number, delta: -1 | 1) => {
    setManifestStops((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      next.splice(target, 0, removed);
      return next;
    });
  };

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const pairedDriver = activeDrivers.find(
      (d) => d.assignedVehicleId === vehicleId,
    );
    if (pairedDriver) {
      setSelectedDriverId(pairedDriver.id);
    }
  };

  const handlePublish = (event: React.FormEvent) => {
    event.preventDefault();
    if (!anchorBooking || manifestStops.length === 0) return;
    if (!selectedDriverId || !selectedVehicleId) {
      pushToast({
        tone: "error",
        title: "Assign driver and cab",
        description: "Select both an active chauffeur and vehicle before publishing.",
      });
      return;
    }

    publishMutation.mutate({
      travelDate: anchorBooking.travelDate,
      shiftId: anchorBooking.shiftId,
      officeId: anchorBooking.officeId,
      direction: anchorBooking.direction,
      driverId: selectedDriverId,
      vehicleId: selectedVehicleId,
      plannedStartAt: new Date(`${plannedStartLocal}:00+05:30`).toISOString(),
      stops: manifestStops.map((stop, idx) => ({
        bookingId: stop.booking.bookingId,
        sequenceNo: idx + 1,
        scheduledArrivalAt: new Date(
          `${stop.scheduledArrivalLocal}:00+05:30`,
        ).toISOString(),
      })),
    });
  };

  return (
    <AdminShell
      title="Manual Dispatch Workbench"
      subtitle="Group approved shift bookings by corridor, assign cab & chauffeur, order stops, and publish manifests"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVrptwOpen(true)}
          >
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            VRPTW Route Suggestions
          </Button>
          <Link
            href="/approvals"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to Approval Queue
          </Link>
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

        <AutoAllocationPanel
          shiftFilter={shiftFilter}
          directionFilter={directionFilter}
          activeOfficeId={activeOfficeId}
          canApprove={canApprove}
          onLoadProposal={applyAllocationProposalToManifest}
          onLoadUnallocated={applyUnallocatedToManifest}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left Pane: Approved Booking Pool */}
          <ManifestCard className="xl:col-span-7">
            <ManifestHeader
              title="Approved Bookings Pool"
              description={`${approvedBookings.length} rider(s) ready for cab assignment`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 border-b border-border bg-[#F8FAFC] px-4 py-3">
              <Select
                id="dispatch-shift-filter"
                name="shiftFilter"
                aria-label="Filter approved bookings by shift"
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
              >
                <option value="">All shifts</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.shiftTimeLocal} ({s.direction})
                  </option>
                ))}
              </Select>
              <Select
                id="dispatch-dir-filter"
                name="directionFilter"
                aria-label="Filter approved bookings by direction"
                value={directionFilter}
                onChange={(e) =>
                  setDirectionFilter(e.target.value as "" | TripDirection)
                }
              >
                <option value="">All directions</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
              </Select>
              <Input
                id="dispatch-corridor-filter"
                name="corridorFilter"
                aria-label="Filter approved bookings by corridor"
                placeholder="Filter corridor..."
                value={corridorFilter}
                onChange={(e) => setCorridorFilter(e.target.value)}
              />
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : approvedBookings.length === 0 ? (
              <EmptyState
                title="No approved bookings waiting"
                description="Approve pending requests in the Duty Approval Queue first so they enter this dispatch pool."
                action={
                  <Link href="/approvals" className={buttonVariants({ size: "sm" })}>
                    Open Approval Queue
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {approvedBookings.map((booking) => {
                  const added = manifestBookingIds.has(booking.bookingId);
                  const compatible = isCompatibleWithAnchor(booking);
                  return (
                    <div
                      key={booking.bookingId}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-150 hover:bg-[#F7FAFF]"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {booking.employeeName}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {booking.employeeCode}
                          </span>
                          <StatusBadge tone={statusToneFor(booking.direction)}>
                            {booking.direction}
                          </StatusBadge>
                          {(booking.normalizedLocality || booking.corridorTag) && (
                            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                              {booking.normalizedLocality ?? booking.corridorTag}
                            </span>
                          )}
                          {booking.timePreference === "ARRIVE_BY" && (
                            <StatusBadge tone="cobalt">
                              Arrive &lt;= {booking.requestedTimeLocal ?? "—"}
                            </StatusBadge>
                          )}
                          {booking.isArriveByInfeasible && (
                            <StatusBadge tone="amber">Lead-time warning</StatusBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {booking.pickupLocationName}
                          </span>{" "}
                          · {booking.pickupAddress}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                          <span>
                            {booking.travelDate} · {booking.shiftName} (
                            {booking.shiftTimeLocal})
                          </span>
                          <span>
                            Pickup {formatLocalTime(booking.scheduledPickupAt)}
                          </span>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${booking.latitude},${booking.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <MapPin className="size-3" aria-hidden="true" />
                            {booking.latitude.toFixed(4)}, {booking.longitude.toFixed(4)}
                            <ExternalLink className="size-2.5" aria-hidden="true" />
                          </a>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {added ? (
                          <StatusBadge tone="emerald" dot>
                            On Manifest
                          </StatusBadge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canApprove || !compatible}
                            onClick={() => addStop(booking)}
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                            Add Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ManifestCard>

          {/* Right Pane: Active Cab Manifest Builder */}
          <ManifestCard className="xl:col-span-5 xl:sticky xl:top-16">
            <ManifestHeader
              title="Active Cab Manifest"
              description={
                anchorBooking
                  ? `${anchorBooking.travelDate} · ${anchorBooking.shiftName} · ${anchorBooking.officeName}`
                  : "Select approved riders from the left pool to assemble a cab route"
              }
              actions={
                manifestStops.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setManifestStops([])}
                  >
                    Clear stops
                  </Button>
                )
              }
            />

            <form onSubmit={handlePublish} className="p-4 space-y-4">
              {/* Seat Capacity Telemetry Meter */}
              <div className="rounded-lg border border-border bg-[#F8FAFC] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <CarFront className="size-3.5 text-primary" aria-hidden="true" />
                    Seat Capacity Check
                  </span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      capacityExceeded ? "text-[#BE123C]" : "text-foreground"
                    }`}
                  >
                    {manifestStops.length} / {selectedCapacity} seats
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div
                    className={`h-full w-full origin-left transition-[transform,background-color] duration-200 ease-[var(--ease-harbor)] ${
                      capacityExceeded ? "bg-[#E11D48]" : "bg-[#2563EB]"
                    }`}
                    style={{
                      transform: `scaleX(${Math.min(
                        1,
                        manifestStops.length / Math.max(1, selectedCapacity),
                      )})`,
                    }}
                  />
                </div>
                {capacityExceeded && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#BE123C]">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    Passenger count exceeds cab capacity. Remove stops or choose an SUV/Tempo.
                  </p>
                )}
              </div>

              {/* Vehicle, Driver & Planned Start */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="dsp-vehicle" required>
                    Assign Vehicle
                  </FieldLabel>
                  <Select
                    id="dsp-vehicle"
                    value={selectedVehicleId}
                    onChange={(e) => handleVehicleSelect(e.target.value)}
                    required
                  >
                    <option value="">Select fleet vehicle...</option>
                    {availableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registrationNo} · {v.modelName} ({v.seatingCapacity} seats)
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <FieldLabel htmlFor="dsp-driver" required>
                    Assign Chauffeur
                  </FieldLabel>
                  <Select
                    id="dsp-driver"
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    required
                  >
                    <option value="">Select active driver...</option>
                    {activeDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.availabilityStatus})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="dsp-start" required>
                  Planned Dispatch Departure (IST)
                </FieldLabel>
                <Input
                  id="dsp-start"
                  type="datetime-local"
                  value={plannedStartLocal}
                  onChange={(e) => setPlannedStartLocal(e.target.value)}
                  required
                />
              </div>

              {/* Stop Sequence Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Ordered Stop Sequence ({manifestStops.length})
                  </span>
                  {anchorBooking?.direction === "LOGIN" && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      + Auto campus drop-off terminus
                    </span>
                  )}
                </div>

                {manifestStops.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                    Click &ldquo;Add Stop&rdquo; on approved rider rows to populate stop sequence 1..N.
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {manifestStops.map((stop, idx) => (
                      <li
                        key={stop.booking.bookingId}
                        className="rounded-lg border border-border bg-card p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[#EFF6FF] font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {stop.booking.employeeName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {stop.booking.pickupLocationName} (
                                {stop.booking.corridorTag ?? "Hyderabad"})
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={idx === 0}
                              onClick={() => moveStop(idx, -1)}
                              aria-label={`Move ${stop.booking.employeeName} earlier`}
                            >
                              <ArrowUp className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={idx === manifestStops.length - 1}
                              onClick={() => moveStop(idx, 1)}
                              aria-label={`Move ${stop.booking.employeeName} later`}
                            >
                              <ArrowDown className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => removeStop(stop.booking.bookingId)}
                              aria-label={`Remove ${stop.booking.employeeName}`}
                            >
                              <Trash2 className="size-3.5 text-[#E11D48]" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <FieldLabel htmlFor={`stop-time-${stop.booking.bookingId}`}>
                            Scheduled Stop ETA (IST)
                          </FieldLabel>
                          <Input
                            id={`stop-time-${stop.booking.bookingId}`}
                            type="datetime-local"
                            className="h-8 text-xs font-mono tabular-nums"
                            value={stop.scheduledArrivalLocal}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setManifestStops((prev) =>
                                prev.map((s, sIdx) =>
                                  sIdx === idx
                                    ? { ...s, scheduledArrivalLocal: nextVal }
                                    : s,
                                ),
                              );
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  !canApprove ||
                  manifestStops.length === 0 ||
                  capacityExceeded ||
                  publishMutation.isPending
                }
              >
                <Send className="size-4" aria-hidden="true" />
                {publishMutation.isPending
                  ? "Publishing Trip Manifest..."
                  : "Publish Trip & Notify Chauffeur"}
              </Button>
            </form>
          </ManifestCard>
        </div>
      </div>

      <SlideOverDrawer
        open={vrptwOpen}
        onClose={() => setVrptwOpen(false)}
        title="VRPTW Dispatch Recommendations"
        subtitle="Capacitated corridor clustering + 2-opt stop ordering (review before publishing)"
        width="lg"
      >
        <div className="space-y-4">
          {vrptwData && (
            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge tone="cobalt" dot>
                  {vrptwData.evaluation.engine}
                </StatusBadge>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {vrptwData.evaluation.totalApprovedBookingsEvaluated} booking(s)
                  · {vrptwData.evaluation.recommendedClustersCount} cluster(s) ·{" "}
                  {vrptwData.evaluation.totalEstimatedDistanceKm.toFixed(1)} km
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {vrptwData.evaluation.methodology}
              </p>
            </div>
          )}

          {vrptwLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : !vrptwData || vrptwData.clusters.length === 0 ? (
            <EmptyState
              title="No APPROVED bookings available for clustering"
              description="Approve pending shift requests in Approvals first, then run VRPTW clustering."
            />
          ) : (
            <div className="space-y-3">
              {vrptwData.clusters.map((cluster) => (
                <div
                  key={cluster.clusterId}
                  className="rounded-[10px] border border-border bg-card p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-foreground tabular-nums">
                        {cluster.clusterId} · {cluster.travelDate} ·{" "}
                        {cluster.shiftTimeLocal} ({cluster.direction})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cluster.recommendedVehicle?.registrationNo ??
                          "Unassigned cab"}{" "}
                        · {cluster.recommendedDriver?.fullName ?? "No driver"} ·{" "}
                        {cluster.seatCount}/{cluster.vehicleCapacity} seats
                      </p>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums">
                      <p className="font-semibold text-foreground">
                        {cluster.estimatedDistanceKm.toFixed(1)} km ·{" "}
                        {cluster.estimatedDurationMinutes} min
                      </p>
                      <p className="text-muted-foreground">
                        Max detour {cluster.maxDetourRatio}x
                      </p>
                    </div>
                  </div>

                  {cluster.warnings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cluster.warnings.map((w) => (
                        <StatusBadge key={w} tone="amber">
                          {w}
                        </StatusBadge>
                      ))}
                    </div>
                  )}

                  <ol className="divide-y divide-border rounded-lg border border-border bg-[#F8FAFC]">
                    {cluster.stops.map((stop) => (
                      <li
                        key={stop.bookingId}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-primary mr-2">
                            #{stop.sequenceNo}
                          </span>
                          <span className="font-medium text-foreground">
                            {stop.employeeName}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            ({stop.pickupLocationName})
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums">
                          {formatLocalTime(stop.scheduledArrivalAt)}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void refetchVrptw()}
                    >
                      Recalculate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canApprove}
                      onClick={() => applyClusterToManifest(cluster)}
                    >
                      Load Into Manifest
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}

