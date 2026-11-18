"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import {
  apiRequest,
  formatDelayBadge,
  formatLocalTime,
} from "@/lib/api";
import type { DriverItem, TripDetailData, VehicleItem } from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";

export function TripDetailView() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? "";
  const queryClient = useQueryClient();
  const { identity, canApprove } = useDevSession();
  const { pushToast } = useToast();

  const [modifyOpen, setModifyOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [orderedStops, setOrderedStops] = useState<
    Array<{ id: string; locationName: string; stopType: string }>
  >([]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["trip-detail", identity.orgId, identity.userId, tripId],
    queryFn: () => apiRequest<TripDetailData>(`/admin/trips/${tripId}`, identity),
    enabled: Boolean(tripId),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<DriverItem[]>("/admin/drivers", identity),
    enabled: modifyOpen,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VehicleItem[]>("/admin/vehicles", identity),
    enabled: modifyOpen,
  });

  const modifyMutation = useMutation({
    mutationFn: (payload: {
      reason: string;
      driverId?: string;
      vehicleId?: string;
      stopOrder?: Array<{ stopId: string; sequenceNo: number }>;
    }) =>
      apiRequest(`/admin/dispatch/${tripId}/modify`, identity, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Trip dispatch updated",
        description: "Stop order / fleet allocation persisted with audit trail.",
      });
      setModifyOpen(false);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["trip-detail", identity.orgId] });
      void queryClient.invalidateQueries({ queryKey: ["trips-list"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Modification blocked",
        description: err.message,
      });
    },
  });

  if (isLoading || !data) {
    return (
      <AdminShell title="Trip Manifest Inspector">
        {error ? (
          <QueryErrorBanner message={error.message} onRetry={() => void refetch()} />
        ) : (
          <PageSkeleton />
        )}
      </AdminShell>
    );
  }

  const { trip, stops, assignments, events, noShows } = data;
  const isTerminal =
    trip.status === "COMPLETED" ||
    trip.status === "CANCELLED" ||
    trip.status === "ABORTED";

  const openModifyDrawer = () => {
    setDriverId(trip.driverId ?? "");
    setVehicleId(trip.vehicleId ?? "");
    setOrderedStops(
      stops.map((s) => ({
        id: s.id,
        locationName: s.locationName,
        stopType: s.stopType,
      })),
    );
    setReason("");
    setModifyOpen(true);
  };

  const moveEditableStop = (idx: number, delta: -1 | 1) => {
    setOrderedStops((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const submitModify = (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) {
      pushToast({
        tone: "error",
        title: "Reason required",
        description: "Provide at least 3 characters for the immutable audit log.",
      });
      return;
    }
    modifyMutation.mutate({
      reason: reason.trim(),
      driverId: driverId && driverId !== trip.driverId ? driverId : undefined,
      vehicleId: vehicleId && vehicleId !== trip.vehicleId ? vehicleId : undefined,
      stopOrder: orderedStops.map((s, idx) => ({
        stopId: s.id,
        sequenceNo: idx + 1,
      })),
    });
  };

  return (
    <AdminShell
      title={`Trip ${trip.tripCode}`}
      subtitle={`${trip.travelDate} · ${trip.shiftName} (${trip.shiftTimeLocal}) · ${trip.officeName}`}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/trips"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All Trips
          </Link>
          {canApprove && !isTerminal && (
            <Button type="button" size="sm" onClick={openModifyDrawer}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Modify Dispatch
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <ManifestCard className="p-4">
            <p className="text-xs text-muted-foreground">Trip Status</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge tone={statusToneFor(trip.status)} dot>
                {trip.status}
              </StatusBadge>
              <StatusBadge tone={statusToneFor(trip.direction)}>
                {trip.direction}
              </StatusBadge>
            </div>
          </ManifestCard>

          <ManifestCard className="p-4">
            <p className="text-xs text-muted-foreground">Assigned Chauffeur</p>
            <p className="mt-1.5 text-sm font-semibold text-foreground">
              {trip.driverName ?? "Unassigned"}
            </p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {trip.driverCode ?? "—"} · {trip.driverPhone ?? "—"}
            </p>
          </ManifestCard>

          <ManifestCard className="p-4">
            <p className="text-xs text-muted-foreground">Fleet Cab</p>
            <p className="mt-1.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {trip.vehicleRegistrationNo ?? "Unassigned"}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {trip.vehicleModelName ?? "—"} ·{" "}
              {trip.seatingCapacity ? `${trip.seatingCapacity} seats` : "—"}
            </p>
          </ManifestCard>

          <ManifestCard className="p-4">
            <p className="text-xs text-muted-foreground">Schedule</p>
            <p className="mt-1.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {formatLocalTime(trip.plannedStartAt)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {stops.length} route stop(s) · {assignments.length} rider(s)
            </p>
          </ManifestCard>
        </div>

        {/* Route Stops + Passenger Delay Ledger */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <ManifestCard className="xl:col-span-5">
            <ManifestHeader
              title="Ordered Route Stops"
              description="Sequential GPS geofence checkpoints and scheduled arrival windows"
            />
            <ol className="divide-y divide-border">
              {stops.map((stop) => (
                <li key={stop.id} className="px-4 py-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded bg-[#EFF6FF] font-mono text-xs font-semibold text-[#1D4ED8] tabular-nums">
                        {stop.sequenceNo}
                      </span>
                      <span className="font-medium text-foreground">
                        {stop.locationName}
                      </span>
                      <StatusBadge tone="neutral">{stop.stopType}</StatusBadge>
                    </div>
                    <StatusBadge tone={statusToneFor(stop.status)}>
                      {stop.status}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground pl-7">
                    {stop.address}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-7 pt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      ETA {formatLocalTime(stop.scheduledArrivalAt)}
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <MapPin className="size-3" aria-hidden="true" />
                      {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                      <ExternalLink className="size-2.5" aria-hidden="true" />
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </ManifestCard>

          <ManifestCard className="xl:col-span-7">
            <ManifestHeader
              title="Passenger Assignments & Delay Decomposition"
              description="Separates driver arrival lateness from curbside employee wait time"
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#F8FAFC]">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Employee
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Pickup Schedule
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Arrival Delay
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Wait Duration
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assignments.map((pax) => (
                    <tr key={pax.assignmentId}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">
                          {pax.employeeName}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground tabular-nums">
                          {pax.employeeCode} · {pax.department}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                        {formatLocalTime(pax.scheduledPickupAt)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                        <span
                          className={
                            (pax.arrivalDelaySeconds ?? 0) > 120
                              ? "font-semibold text-[#BE123C]"
                              : "text-foreground"
                          }
                        >
                          {formatDelayBadge(pax.arrivalDelaySeconds)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                        {pax.passengerWaitSeconds !== null
                          ? `${pax.passengerWaitSeconds}s`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={statusToneFor(pax.status)} dot>
                          {pax.status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ManifestCard>
        </div>

        {/* Chronological Event Timeline + No-Shows */}
        <ManifestCard>
          <ManifestHeader
            title="Append-Only Trip Event Telemetry"
            description="Chronological audit trail of dispatch publications, modifications, arrivals, and boardings"
          />
          {events.length === 0 ? (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              No trip events logged yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono font-semibold text-foreground">
                      {evt.eventType}
                    </span>
                    {evt.actorRole && (
                      <StatusBadge tone="neutral">{evt.actorRole}</StatusBadge>
                    )}
                    {evt.payloadJson && (
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(evt.payloadJson)}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatLocalTime(evt.serverReceivedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {noShows.length > 0 && (
            <div className="border-t border-border bg-[#FFF1F2]/60 px-4 py-3 text-xs text-[#9F1239] flex items-center gap-2">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {noShows.length} recorded no-show incident(s) attached to this manifest.
              </span>
            </div>
          )}
        </ManifestCard>
      </div>

      {/* Modify Dispatch Slide-Over */}
      <SlideOverDrawer
        open={modifyOpen}
        onClose={() => setModifyOpen(false)}
        title="Modify Published Dispatch"
        subtitle={`${trip.tripCode} · Audits all stop or vehicle changes`}
      >
        <form id="modify-dispatch-form" onSubmit={submitModify} className="space-y-4">
          <div>
            <FieldLabel htmlFor="mod-reason" required>
              Audit Modification Reason
            </FieldLabel>
            <Input
              id="mod-reason"
              required
              minLength={3}
              placeholder="e.g. Swap pickup stop 1 and 2 for ORR traffic"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="mod-vehicle">Vehicle</FieldLabel>
              <Select
                id="mod-vehicle"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">Keep current vehicle</option>
                {vehicles
                  .filter((v) => v.isActive)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNo} · {v.modelName} ({v.seatingCapacity}s)
                    </option>
                  ))}
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="mod-driver">Chauffeur</FieldLabel>
              <Select
                id="mod-driver"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Keep current driver</option>
                {drivers
                  .filter((d) => !d.isSuspended)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName} ({d.driverCode})
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Stop sequence order (1..{orderedStops.length})
            </p>
            <ol className="space-y-2">
              {orderedStops.map((s, idx) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-[#F8FAFC] px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-primary tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {s.locationName}
                    </span>
                    <StatusBadge tone="neutral">{s.stopType}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={idx === 0}
                      onClick={() => moveEditableStop(idx, -1)}
                      aria-label={`Move stop ${s.locationName} up`}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={idx === orderedStops.length - 1}
                      onClick={() => moveEditableStop(idx, 1)}
                      aria-label={`Move stop ${s.locationName} down`}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </form>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setModifyOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="modify-dispatch-form"
            disabled={modifyMutation.isPending}
          >
            Save Dispatch Changes
          </Button>
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}

