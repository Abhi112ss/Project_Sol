"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CarFront,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type {
  AutoAllocationProposal,
  AutoAllocationResponse,
  TripDirection,
  UnallocatedGroupItem,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

interface AutoAllocationPanelProps {
  shiftFilter: string;
  directionFilter: "" | TripDirection;
  activeOfficeId: string;
  canApprove: boolean;
  onLoadProposal: (proposal: AutoAllocationProposal) => void;
  onLoadUnallocated: (group: UnallocatedGroupItem) => void;
}

function matchToneFor(
  matchType: AutoAllocationProposal["rationale"]["localityMatchType"],
) {
  switch (matchType) {
    case "EXACT_LOCALITY":
      return "emerald" as const;
    case "NEARBY_LOCALITY":
      return "cobalt" as const;
    case "CROSS_ZONE_FALLBACK":
      return "amber" as const;
    default:
      return "neutral" as const;
  }
}

export function AutoAllocationPanel({
  shiftFilter,
  directionFilter,
  activeOfficeId,
  canApprove,
  onLoadProposal,
  onLoadUnallocated,
}: AutoAllocationPanelProps) {
  const queryClient = useQueryClient();
  const { identity } = useDevSession();
  const { pushToast } = useToast();

  const [travelDateFilter, setTravelDateFilter] = useState("");
  const [plan, setPlan] = useState<AutoAllocationResponse | null>(null);
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>([]);

  const solveMutation = useMutation({
    mutationFn: () =>
      apiRequest<AutoAllocationResponse>(
        "/admin/dispatch/auto-allocate",
        identity,
        {
          method: "POST",
          body: {
            travelDate: travelDateFilter || undefined,
            shiftId: shiftFilter || undefined,
            direction: directionFilter || undefined,
            officeId: activeOfficeId || undefined,
          },
        },
      ),
    onSuccess: (res) => {
      setPlan(res);
      setSelectedClusterIds(res.proposals.map((p) => p.clusterId));
      pushToast({
        tone: "success",
        title: "Auto-allocation plan generated",
        description: `${res.summary.proposedTripsCount} trip group(s) planned from ${res.summary.totalConfirmedBookings} confirmed booking(s).`,
      });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Auto-allocation failed",
        description: err.message,
      });
    },
  });

  const publishBatchMutation = useMutation({
    mutationFn: (proposalsToPublish: AutoAllocationProposal[]) =>
      apiRequest<{ publishedCount: number }>(
        "/admin/dispatch/auto-allocate/publish",
        identity,
        {
          method: "POST",
          idempotent: true,
          body: {
            runId: plan?.runId ?? undefined,
            groups: proposalsToPublish.map((p) => ({
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
          },
        },
      ),
    onSuccess: (res) => {
      pushToast({
        tone: "success",
        title: `${res.publishedCount} allocated trip(s) published`,
        description:
          "Drivers & employees notified with concurrency-locked interval verification.",
      });
      void queryClient.invalidateQueries({ queryKey: ["dispatch-approved-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
      void queryClient.invalidateQueries({ queryKey: ["trips-list"] });
      solveMutation.mutate();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Allocation publish blocked",
        description: err.message,
      });
    },
  });

  const toggleClusterSelection = (clusterId: string) => {
    setSelectedClusterIds((prev) =>
      prev.includes(clusterId)
        ? prev.filter((id) => id !== clusterId)
        : [...prev, clusterId],
    );
  };

  const selectedProposals =
    plan?.proposals.filter((p) => selectedClusterIds.includes(p.clusterId)) ??
    [];

  return (
    <ManifestCard>
      <ManifestHeader
        title="Location-First & Interval-Aware Auto-Allocation"
        description="Group confirmed passengers by canonical locality, enforce Sedan (4) / SUV (6) capacity, and verify driver interval & turnaround buffers"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <FieldLabel htmlFor="auto-alloc-date">Travel Date (optional)</FieldLabel>
              <Input
                id="auto-alloc-date"
                type="date"
                className="h-8 text-xs font-mono"
                value={travelDateFilter}
                onChange={(e) => setTravelDateFilter(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={solveMutation.isPending}
              onClick={() => solveMutation.mutate()}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {solveMutation.isPending ? "Solving Groups..." : "Run Auto-Allocation"}
            </Button>
            {plan && selectedProposals.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canApprove || publishBatchMutation.isPending}
                onClick={() => publishBatchMutation.mutate(selectedProposals)}
              >
                <Send className="size-3.5 text-primary" aria-hidden="true" />
                {publishBatchMutation.isPending
                  ? "Publishing..."
                  : `Approve & Publish (${selectedProposals.length})`}
              </Button>
            )}
          </div>
        }
      />

      {!plan ? (
        <div className="px-4 py-5 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2 bg-[#F8FAFC]">
          <span>
            Click <strong className="text-foreground">Run Auto-Allocation</strong> to inspect canonical locality clusters, driver locality matches, Sedan/SUV counts, spare-seat options, and interval feasibility before publishing.
          </span>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Top Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-primary" aria-hidden="true" />
                Confirmed Bookings
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">
                {plan.summary.totalConfirmedBookings}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {plan.summary.allocatedBookingsCount} allocated ·{" "}
                {plan.summary.unallocatedBookingsCount} unallocated
              </p>
            </div>

            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-primary" aria-hidden="true" />
                Grouped Trips
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">
                {plan.summary.proposedTripsCount}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {plan.summary.localityGroupsCount} locality group(s) · ±
                {plan.configSnapshot.driverTurnaroundBufferMinutes}m buffer
              </p>
            </div>

            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <CarFront className="size-3.5 text-primary" aria-hidden="true" />
                Fleet Breakdown
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">
                {plan.summary.recommendedSedans} Sedan · {plan.summary.recommendedSuvs} SUV
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                Max 4 Sedan / 6 SUV (excl. driver)
              </p>
            </div>

            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-[#B45309]" aria-hidden="true" />
                Exceptions & Spare Seats
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-foreground tabular-nums">
                {plan.summary.unallocatedGroupsCount} unalloc ·{" "}
                {plan.conflictingBookings.length} conflict
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {plan.summary.spareSeatSuggestionsCount} spare-seat tip(s)
              </p>
            </div>
          </div>

          {/* Conflicting Reservations Alert */}
          {plan.conflictingBookings.length > 0 && (
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#92400E] flex items-center gap-1.5">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                Overlapping Employee Reservations Detected ({plan.conflictingBookings.length})
              </p>
              <ul className="space-y-1 text-xs text-[#92400E]">
                {plan.conflictingBookings.map((c) => (
                  <li key={`${c.employeeId}-${c.travelDate}-${c.direction}`}>
                    <strong>{c.employeeName}</strong> ({c.employeeCode}): {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Proposed Allocation Groups */}
          {plan.proposals.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {plan.proposals.map((prop) => {
                const checked = selectedClusterIds.includes(prop.clusterId);
                return (
                  <div
                    key={prop.clusterId}
                    className={`rounded-[10px] border p-3.5 space-y-2.5 transition-colors ${
                      checked
                        ? "border-primary/40 bg-card shadow-xs"
                        : "border-border bg-card opacity-85"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClusterSelection(prop.clusterId)}
                          className="mt-1 rounded border-border text-primary"
                          aria-label={`Select ${prop.clusterId} for batch publish`}
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                              {prop.clusterId}
                            </span>
                            <StatusBadge tone={statusToneFor(prop.direction)}>
                              {prop.direction}
                            </StatusBadge>
                            <StatusBadge tone={matchToneFor(prop.rationale.localityMatchType)}>
                              <MapPin className="size-3" aria-hidden="true" />
                              {prop.localityMatchSummary}
                            </StatusBadge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {prop.travelDate} · {prop.officeName} · {prop.shiftName}
                          </p>
                        </div>
                      </label>

                      <div className="text-right font-mono text-xs tabular-nums shrink-0">
                        <p className="font-semibold text-foreground">
                          {prop.seatCount}/{prop.suggestedVehicle.effectiveCapacity} seats ·{" "}
                          {prop.suggestedVehicle.vehicleType}
                        </p>
                        <p className="text-muted-foreground">
                          {prop.estimatedDistanceKm.toFixed(1)} km ·{" "}
                          {prop.maxDetourRatio}x detour
                        </p>
                      </div>
                    </div>

                    {/* Driver + Vehicle + Interval rationale */}
                    <div className="rounded-lg border border-border bg-[#F8FAFC] p-2.5 text-xs space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          Driver: {prop.suggestedDriver.fullName} (
                          {prop.suggestedDriver.baseLocalityName ?? "Unspecified base"})
                        </span>
                        <StatusBadge tone="emerald" dot>
                          Interval OK ·{" "}
                          {prop.rationale.deadheadKm != null
                            ? `${prop.rationale.deadheadKm} km deadhead`
                            : "Base neutral"}
                        </StatusBadge>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        Cab: {prop.suggestedVehicle.registrationNo} (
                        {prop.suggestedVehicle.modelName}) · Window{" "}
                        {formatLocalTime(prop.plannedStartAt)} -{" "}
                        {formatLocalTime(prop.plannedEndAt)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {prop.rationale.groupingReason} {prop.rationale.selectionReason}
                      </p>
                      {prop.rationale.warnings.map((w) => (
                        <p
                          key={w}
                          className="text-[11px] font-medium text-[#B45309] flex items-center gap-1"
                        >
                          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                          {w}
                        </p>
                      ))}
                    </div>

                    {/* Ordered Stops */}
                    <ol className="divide-y divide-border rounded-lg border border-border">
                      {prop.stops.map((s) => (
                        <li
                          key={s.bookingId}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0 flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-primary">
                              #{s.sequenceNo}
                            </span>
                            <span className="font-medium text-foreground truncate">
                              {s.employeeName}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              ({s.localityName ?? s.pickupLocationName})
                            </span>
                            <span className="rounded border border-border bg-[#F8FAFC] px-1 py-0.5 font-mono text-[10px] text-foreground">
                              {s.timePreference === "ARRIVE_BY"
                                ? `Arrive <= ${s.requestedTimeLocal ?? ""}`
                                : `Pickup ~${s.requestedTimeLocal ?? ""}`}
                            </span>
                            {s.isArriveByInfeasible && (
                              <StatusBadge tone="crimson">Infeasible</StatusBadge>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0 inline-flex items-center gap-1">
                            <Clock className="size-3" aria-hidden="true" />
                            {formatLocalTime(s.scheduledArrivalAt)}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => onLoadProposal(prop)}
                      >
                        Load into Manual Workbench
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        disabled={!canApprove || publishBatchMutation.isPending}
                        onClick={() => publishBatchMutation.mutate([prop])}
                      >
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        Publish Trip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Unallocated Groups with explicit reason */}
          {plan.unallocatedGroups.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#9F1239] flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                Unallocated Locality Groups ({plan.unallocatedGroups.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {plan.unallocatedGroups.map((ug) => (
                  <div
                    key={ug.clusterId}
                    className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2]/60 p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#9F1239]">
                        {ug.clusterId} · {ug.primaryLocalityName} ({ug.seatCount} seats)
                      </span>
                      <StatusBadge tone="crimson">{ug.reasonCode}</StatusBadge>
                    </div>
                    <p className="text-[#881337]">{ug.explanation}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Suggested action: {ug.suggestedAction}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => onLoadUnallocated(ug)}
                      >
                        Load Stops for Manual Override
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spare Seat Advisory Suggestions */}
          {plan.spareSeatSuggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CarFront className="size-3.5 text-primary" aria-hidden="true" />
                Spare-Seat Advisory (Published Unstarted Trips — Never Auto-Mutated)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {plan.spareSeatSuggestions.map((sp) => (
                  <div
                    key={sp.tripId}
                    className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF]/60 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-primary">
                        {sp.tripCode} ({sp.vehicleRegistrationNo ?? sp.vehicleType})
                      </span>
                      <StatusBadge tone="cobalt">
                        {sp.spareSeats} spare seat(s)
                      </StatusBadge>
                    </div>
                    <p className="text-foreground">{sp.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Waiting: {sp.candidateEmployees.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ManifestCard>
  );
}
