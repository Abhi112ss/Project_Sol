"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Crosshair,
  ExternalLink,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Signal,
  Users,
} from "lucide-react";
import { io } from "socket.io-client";
import { AdminShell } from "@/components/layout/admin-shell";
import { useDevSession } from "@/components/providers";
import { StatusBadge, statusToneFor, type StatusBadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { QueryErrorBanner } from "@/components/ui/empty-state";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_API_BASE_URL,
  apiRequest,
  formatDelayBadge,
  formatLocalTime,
} from "@/lib/api";
import type {
  FleetHealthStatus,
  FleetLiveResponse,
  FleetLiveTelemetry,
  FleetLiveVehicle,
  TripBreadcrumbsResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const LiveFleetMap = dynamic(
  () => import("./live-fleet-map").then((mod) => mod.LiveFleetMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-[#EAF0F8]">
        <Skeleton className="h-12 w-48" />
      </div>
    ),
  },
);

type HealthFilter = "" | FleetHealthStatus;
type TripStatusFilter = "ALL_ACTIVE" | "IN_PROGRESS" | "DRIVER_ACCEPTED" | "ASSIGNED";

function healthBadgeMeta(health: FleetHealthStatus): {
  label: string;
  tone: NonNullable<StatusBadgeProps["tone"]>;
} {
  switch (health) {
    case "LIVE":
      return { label: "Live GPS", tone: "emerald" };
    case "DELAYED":
      return { label: "Delayed", tone: "amber" };
    case "STALE":
      return { label: "Stale Signal", tone: "amber" };
    case "EMERGENCY":
      return { label: "SOS Alert", tone: "crimson" };
    case "NO_SIGNAL":
    default:
      return { label: "No Signal", tone: "slate" };
  }
}

function formatAgeSeconds(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null) return "—";
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const mins = Math.floor(ageSeconds / 60);
  const rem = ageSeconds % 60;
  return rem === 0 ? `${mins}m ago` : `${mins}m ${rem}s ago`;
}

function buildSocketNamespaceUrl(): string {
  const origin = DEFAULT_API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${origin}/ws/transport`;
}

export function LiveTrackingView() {
  const queryClient = useQueryClient();
  const { identity, activeOfficeId } = useDevSession();

  const searchInputId = useId();
  const statusSelectId = useId();
  const shiftSelectId = useId();

  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>("ALL_ACTIVE");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);

  const queryKey = useMemo(
    () =>
      [
        "admin-fleet-live",
        identity.orgId,
        identity.userId,
        identity.role,
        statusFilter,
        activeOfficeId,
        shiftFilter,
      ] as const,
    [identity.orgId, identity.userId, identity.role, statusFilter, activeOfficeId, shiftFilter],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      apiRequest<FleetLiveResponse>("/admin/fleet/live", identity, {
        query: {
          status: statusFilter,
          officeId: activeOfficeId || undefined,
          shiftId: shiftFilter || undefined,
        },
      }),
    refetchInterval: 15_000,
  });

  // Subscribe to Socket.IO /ws/transport orgOps room & patch telemetry cleanly without reloads
  useEffect(() => {
    const socket = io(buildSocketNamespaceUrl(), {
      transports: ["websocket", "polling"],
      auth: {
        organizationId: identity.orgId,
        userId: identity.userId,
        role: identity.role,
      },
      extraHeaders: {
        "x-dev-org-id": identity.orgId,
        "x-dev-user-id": identity.userId,
        "x-dev-role": identity.role,
      },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });

    const handleConnect = () => {
      setWsConnected(true);
      socket.emit("join", { organizationId: identity.orgId });
    };

    const handleDisconnect = () => {
      setWsConnected(false);
    };

    const handleLocation = (payload: {
      tripId?: string;
      latitude?: number;
      longitude?: number;
      accuracyM?: number | null;
      speedMps?: number | null;
      headingDeg?: number | null;
      recordedAt?: string;
      serverReceivedAt?: string;
      ageSeconds?: number;
      isStale?: boolean;
      etaMinutes?: number | null;
    }) => {
      if (!payload?.tripId || typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
        return;
      }
      queryClient.setQueryData<FleetLiveResponse>(queryKey, (current) => {
        if (!current) return current;
        let touched = false;
        const nextItems = current.items.map((item) => {
          if (item.id !== payload.tripId) return item;
          const incomingMs = payload.recordedAt ? new Date(payload.recordedAt).getTime() : Date.now();
          const currentMs = item.gpsTelemetry?.recordedAt
            ? new Date(item.gpsTelemetry.recordedAt).getTime()
            : 0;
          if (Number.isFinite(currentMs) && Number.isFinite(incomingMs) && incomingMs < currentMs) {
            return item;
          }
          touched = true;
          const nextGps: FleetLiveTelemetry = {
            latitude: payload.latitude!,
            longitude: payload.longitude!,
            accuracyM: payload.accuracyM ?? null,
            speedMps: payload.speedMps ?? null,
            headingDeg: payload.headingDeg ?? null,
            recordedAt: payload.recordedAt ?? new Date().toISOString(),
            serverReceivedAt: payload.serverReceivedAt ?? new Date().toISOString(),
            ageSeconds: payload.ageSeconds ?? 0,
            isStale: payload.isStale ?? false,
            etaMinutes: payload.etaMinutes ?? item.gpsTelemetry?.etaMinutes ?? null,
          };
          const nextHealth: FleetHealthStatus =
            item.openAlertCount > 0
              ? "EMERGENCY"
              : nextGps.isStale
                ? "STALE"
                : (item.maxArrivalDelaySeconds ?? 0) > 120
                  ? "DELAYED"
                  : "LIVE";
          return {
            ...item,
            health: nextHealth,
            gpsTelemetry: nextGps,
          };
        });
        if (!touched) return current;
        return {
          ...current,
          items: nextItems,
          summary: {
            ...current.summary,
            liveCount: nextItems.filter((i) => i.health === "LIVE").length,
            delayedCount: nextItems.filter((i) => i.health === "DELAYED").length,
            staleCount: nextItems.filter((i) => i.health === "STALE").length,
            noSignalCount: nextItems.filter((i) => i.health === "NO_SIGNAL").length,
            emergencyCount: nextItems.filter((i) => i.health === "EMERGENCY").length,
          },
        };
      });
    };

    const handleTripRefreshEvent = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-fleet-live"] });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("vehicle.location", handleLocation);
    socket.on("fleet.vehicle.location.updated", handleLocation);
    socket.on("trip.status.changed", handleTripRefreshEvent);
    socket.on("trip.gps.status.changed", handleTripRefreshEvent);
    socket.on("safety.sos", handleTripRefreshEvent);

    return () => {
      socket.disconnect();
    };
  }, [identity.orgId, identity.userId, identity.role, queryClient, queryKey]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((item) => {
      if (healthFilter && item.health !== healthFilter) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const hit =
          item.tripCode.toLowerCase().includes(q) ||
          (item.driverName ?? "").toLowerCase().includes(q) ||
          (item.vehicleRegistrationNo ?? "").toLowerCase().includes(q) ||
          item.officeName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [data?.items, healthFilter, searchQuery]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedTripId && filteredItems.some((item) => item.id === selectedTripId)) {
      return selectedTripId;
    }
    return filteredItems[0]?.id ?? null;
  }, [filteredItems, selectedTripId]);

  const selectedVehicle: FleetLiveVehicle | null = useMemo(
    () => filteredItems.find((i) => i.id === effectiveSelectedId) ?? null,
    [filteredItems, effectiveSelectedId],
  );

  const { data: breadcrumbs = null } = useQuery({
    queryKey: ["admin-trip-breadcrumbs", identity.orgId, effectiveSelectedId],
    queryFn: () =>
      apiRequest<TripBreadcrumbsResponse>(
        `/admin/trips/${effectiveSelectedId}/locations`,
        identity,
      ),
    enabled: Boolean(effectiveSelectedId),
    refetchInterval: 15_000,
  });

  const summary = data?.summary;
  const offices = data?.filterOptions.offices ?? [];
  const shifts = data?.filterOptions.shifts ?? [];

  const healthTabs: Array<{ key: HealthFilter; label: string; count: number; tone?: string }> = [
    { key: "", label: "All Active", count: summary?.totalActive ?? 0 },
    { key: "LIVE", label: "Live GPS", count: summary?.liveCount ?? 0, tone: "text-[#0F766E]" },
    { key: "DELAYED", label: "Delayed", count: summary?.delayedCount ?? 0, tone: "text-[#B45309]" },
    { key: "STALE", label: "Stale Signal", count: summary?.staleCount ?? 0, tone: "text-[#B45309]" },
    { key: "NO_SIGNAL", label: "No Signal", count: summary?.noSignalCount ?? 0 },
    { key: "EMERGENCY", label: "SOS Open", count: summary?.emergencyCount ?? 0, tone: "text-[#BE123C]" },
  ];

  return (
    <AdminShell
      title="Live Fleet Telemetry & Tracking"
      subtitle="Live Redis coordinates with PostGIS trail history"
      headerActions={
        <div className="flex items-center gap-2">
          <StatusBadge tone={wsConnected ? "emerald" : "amber"} dot>
            {wsConnected ? "Live Socket Connected" : "Reconnecting · 15s Poll"}
          </StatusBadge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    >
      {error && <QueryErrorBanner message={error.message} onRetry={() => void refetch()} />}

      {/* Health Filter Strip & Search */}
      <ManifestCard className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {healthTabs.map((tab) => {
            const active = healthFilter === tab.key;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setHealthFilter(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-harbor)] active:scale-[0.97]",
                  active
                    ? "border-primary bg-[#EFF6FF] text-[#1D4ED8]"
                    : "border-border bg-card text-foreground hover:bg-muted/60",
                )}
              >
                <span className={cn(!active && tab.tone)}>{tab.label}</span>
                <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-border">
          <div>
            <FieldLabel htmlFor={searchInputId}>Search Cab / Driver / Trip</FieldLabel>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={searchInputId}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="TS 07 UA, TRP-, driver..."
                className="pl-8"
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor={statusSelectId}>Trip Duty Phase</FieldLabel>
            <Select
              id={statusSelectId}
              className="mt-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TripStatusFilter)}
            >
              <option value="ALL_ACTIVE">All Active & Assigned</option>
              <option value="IN_PROGRESS">In Progress Only</option>
              <option value="DRIVER_ACCEPTED">Driver Accepted</option>
              <option value="ASSIGNED">Assigned (Pre-Start)</option>
            </Select>
          </div>

          <div>
            <FieldLabel htmlFor={shiftSelectId}>Shift Window</FieldLabel>
            <Select
              id={shiftSelectId}
              className="mt-1"
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
            >
              <option value="">All Shift Windows</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shiftTimeLocal} · {s.name} ({s.direction})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="default"
              className="w-full"
              onClick={() => setFitRequestKey((k) => k + 1)}
            >
              <Crosshair className="size-3.5" aria-hidden="true" />
              Fit All Fleet on Map
            </Button>
          </div>
        </div>
      </ManifestCard>

      {/* Split Fleet Console: Left Active Sortie Queue / Right Interactive Leaflet Map + Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Fleet Sortie Queue */}
        <ManifestCard className="xl:col-span-4 overflow-hidden">
          <ManifestHeader
            title={`Active Fleet (${filteredItems.length})`}
            description="Select any cab to follow route & breadcrumbs"
          />

          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Radio className="size-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  No matching active cabs on shift
                </p>
                <p className="text-xs text-muted-foreground">
                  Dispatch an approved shift batch or start an assigned trip from the Driver App to stream live coordinates here.
                </p>
              </div>
              <Link href="/dispatch" className={buttonVariants({ size: "sm" })}>
                Open Manual Dispatch
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
              {filteredItems.map((vehicle) => {
                const selected = vehicle.id === effectiveSelectedId;
                const badge = healthBadgeMeta(vehicle.health);
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedTripId(vehicle.id)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 transition-[background-color] duration-150 focus-visible:outline-2 focus-visible:outline-primary",
                      selected ? "bg-[#EFF6FF]" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-foreground tabular-nums truncate">
                          {vehicle.tripCode}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
                          {vehicle.vehicleRegistrationNo ?? "Unassigned Cab"}
                        </p>
                      </div>
                      <StatusBadge tone={badge.tone} dot>
                        {badge.label}
                      </StatusBadge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {vehicle.driverName ?? "No driver"} · {vehicle.shiftTimeLocal}
                      </span>
                      <span className="font-mono tabular-nums">
                        {vehicle.boardedCount}/{vehicle.passengerCount} boarded
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {vehicle.nextStop
                          ? `Next #${vehicle.nextStop.sequenceNo}: ${vehicle.nextStop.locationName}`
                          : "All stops resolved"}
                      </span>
                      <span className="font-mono tabular-nums shrink-0">
                        {vehicle.gpsTelemetry
                          ? formatAgeSeconds(vehicle.gpsTelemetry.ageSeconds)
                          : "No GPS"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ManifestCard>

        {/* Right: Interactive Leaflet Map + Docked Telemetry Inspector */}
        <div className="xl:col-span-8 space-y-4">
          <ManifestCard className="overflow-hidden">
            <ManifestHeader
              title="Hyderabad Corridor Live Map"
              description={
                selectedVehicle
                  ? `Focused on ${selectedVehicle.tripCode} · ${selectedVehicle.vehicleRegistrationNo ?? "Cab"}`
                  : "Showing campus offices and active tenant vehicles"
              }
              actions={
                selectedVehicle ? (
                  <Link
                    href={`/trips/${selectedVehicle.id}`}
                    className={buttonVariants({ variant: "outline", size: "xs" })}
                  >
                    Inspect Full Trip
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </Link>
                ) : undefined
              }
            />
            <div className="relative z-0 isolate h-[460px] lg:h-[500px] w-full">
              <LiveFleetMap
                vehicles={filteredItems}
                offices={offices}
                selectedTripId={effectiveSelectedId}
                breadcrumbs={breadcrumbs}
                fitRequestKey={fitRequestKey}
                onSelectTrip={(id) => setSelectedTripId(id)}
              />
            </div>
          </ManifestCard>

          {selectedVehicle && (
            <ManifestCard className="overflow-hidden">
              <ManifestHeader
                title={`${selectedVehicle.vehicleRegistrationNo ?? selectedVehicle.tripCode} · ${selectedVehicle.driverName ?? "Driver Unassigned"}`}
                description={`${selectedVehicle.officeName} · ${selectedVehicle.shiftName} (${selectedVehicle.shiftTimeLocal} ${selectedVehicle.direction})`}
                actions={
                  <StatusBadge tone={statusToneFor(selectedVehicle.status)} dot>
                    {selectedVehicle.status}
                  </StatusBadge>
                }
              />

              <div className="p-4 space-y-4">
                {selectedVehicle.openAlerts.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] p-3 flex items-start gap-2.5"
                  >
                    <AlertTriangle
                      className="size-4 text-[#BE123C] mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="text-xs text-[#BE123C]">
                      <p className="font-semibold">
                        Active Safety Alert ({selectedVehicle.openAlerts[0].alertType})
                      </p>
                      <p className="mt-0.5">
                        {selectedVehicle.openAlerts[0].notes ??
                          "Open emergency requires immediate dispatcher follow-up."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Telemetry Metrics Row (max 4 cells) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Signal className="size-3.5" aria-hidden="true" />
                      <span>Signal Freshness</span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {selectedVehicle.gpsTelemetry
                        ? `${formatAgeSeconds(selectedVehicle.gpsTelemetry.ageSeconds)} (${
                            selectedVehicle.gpsTelemetry.isStale ? "Stale" : "Live"
                          })`
                        : "No Live Ping"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Navigation className="size-3.5" aria-hidden="true" />
                      <span>Coordinates & Accuracy</span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {selectedVehicle.gpsTelemetry
                        ? `${selectedVehicle.gpsTelemetry.latitude.toFixed(4)}, ${selectedVehicle.gpsTelemetry.longitude.toFixed(4)}`
                        : "—"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {selectedVehicle.gpsTelemetry?.accuracyM != null
                        ? `±${Math.round(selectedVehicle.gpsTelemetry.accuracyM)}m GPS accuracy`
                        : "Awaiting first fix"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Activity className="size-3.5" aria-hidden="true" />
                      <span>Speed & Est. Arrival</span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {selectedVehicle.gpsTelemetry?.speedMps != null
                        ? `${Math.round(selectedVehicle.gpsTelemetry.speedMps * 3.6)} km/h`
                        : "0 km/h"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {selectedVehicle.gpsTelemetry?.etaMinutes != null &&
                      !selectedVehicle.gpsTelemetry.isStale
                        ? `Est. ~${selectedVehicle.gpsTelemetry.etaMinutes}m to next stop`
                        : "No active speed ETA"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" aria-hidden="true" />
                      <span>Boarding Progress</span>
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                      {selectedVehicle.boardedCount} / {selectedVehicle.passengerCount} onboard
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      Stops {selectedVehicle.completedStops}/{selectedVehicle.totalStops} · Delay{" "}
                      {formatDelayBadge(selectedVehicle.maxArrivalDelaySeconds)}
                    </p>
                  </div>
                </div>

                {/* Capture vs Server Timestamps + Driver Phone */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 border border-border px-3.5 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono tabular-nums text-muted-foreground">
                    <span>
                      Captured:{" "}
                      <strong className="text-foreground">
                        {formatLocalTime(selectedVehicle.gpsTelemetry?.recordedAt)}
                      </strong>
                    </span>
                    <span>
                      Received:{" "}
                      <strong className="text-foreground">
                        {formatLocalTime(selectedVehicle.gpsTelemetry?.serverReceivedAt)}
                      </strong>
                    </span>
                    <span>
                      Breadcrumbs:{" "}
                      <strong className="text-foreground">
                        {breadcrumbs?.points.length ?? 0} pts
                      </strong>
                    </span>
                  </div>

                  {selectedVehicle.driverPhone && (
                    <a
                      href={`tel:${selectedVehicle.driverPhone}`}
                      className={buttonVariants({ variant: "outline", size: "xs" })}
                    >
                      <Phone className="size-3" aria-hidden="true" />
                      {selectedVehicle.driverPhone}
                    </a>
                  )}
                </div>

                {/* Stop Sequence Table */}
                <div>
                  <h3 className="text-xs font-semibold text-foreground mb-2">
                    Stop Sequence Progression
                  </h3>
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {selectedVehicle.stops.map((stop) => (
                      <div
                        key={stop.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs bg-card"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="inline-flex size-5 items-center justify-center rounded-full bg-secondary font-mono text-[11px] font-semibold text-foreground tabular-nums shrink-0">
                            {stop.sequenceNo}
                          </span>
                          <span className="font-medium text-foreground truncate">
                            {stop.locationName}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            ({stop.stopType})
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            Sched {formatLocalTime(stop.scheduledArrivalAt)}
                          </span>
                          <StatusBadge tone={statusToneFor(stop.status)}>
                            {stop.status}
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ManifestCard>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

