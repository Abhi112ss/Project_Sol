"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { io } from "socket.io-client";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gavel,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { DEFAULT_API_BASE_URL, apiRequest, formatLocalTime } from "@/lib/api";
import type {
  AdminNoShowRecordItem,
  AdminSafetyAlertItem,
  NoShowAppealStatus,
  SafetyAlertSeverity,
  SafetyAlertStatus,
  SafetyAlertType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldLabel, Select, Textarea } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";

type WorkbenchTab = "SAFETY" | "NO_SHOWS";

function severityTone(severity: SafetyAlertSeverity): NonNullable<StatusBadgeProps["tone"]> {
  if (severity === "CRITICAL") return "crimson";
  if (severity === "HIGH") return "amber";
  return "cobalt";
}

function alertStatusTone(status: SafetyAlertStatus): NonNullable<StatusBadgeProps["tone"]> {
  if (status === "OPEN") return "crimson";
  if (status === "ACKNOWLEDGED") return "amber";
  return "emerald";
}

function appealTone(status: NoShowAppealStatus): NonNullable<StatusBadgeProps["tone"]> {
  if (status === "APPEALED") return "amber";
  if (status === "OVERTURNED") return "emerald";
  if (status === "UPHELD") return "slate";
  return "cobalt";
}

function formatAlertTypeLabel(alertType: SafetyAlertType): string {
  switch (alertType) {
    case "SOS":
      return "Emergency SOS";
    case "ROUTE_DEVIATION":
      return "Route Deviation";
    case "LONG_STOPPAGE":
      return "Unscheduled Stoppage";
    case "SAFE_REACH_OVERDUE":
      return "Safe Reach Overdue";
  }
}

function buildSocketNamespaceUrl(): string {
  const origin = DEFAULT_API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${origin}/ws/transport`;
}

export function SafetyWorkbenchView() {
  const queryClient = useQueryClient();
  const { identity, canApprove } = useDevSession();
  const { pushToast } = useToast();

  const alertStatusSelectId = useId();
  const alertTypeSelectId = useId();
  const appealFilterSelectId = useId();
  const resolutionNoteId = useId();
  const appealNoteId = useId();

  const [tab, setTab] = useState<WorkbenchTab>("SAFETY");
  const [wsConnected, setWsConnected] = useState(false);

  // Safety filter state
  const [alertStatusFilter, setAlertStatusFilter] = useState<"" | SafetyAlertStatus>("");
  const [alertTypeFilter, setAlertTypeFilter] = useState<"" | SafetyAlertType>("");
  const [selectedAlert, setSelectedAlert] = useState<AdminSafetyAlertItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  // No-show filter & review state
  const [appealStatusFilter, setAppealStatusFilter] = useState<"" | NoShowAppealStatus>("");
  const [selectedNoShow, setSelectedNoShow] = useState<AdminNoShowRecordItem | null>(null);
  const [appealResolutionNote, setAppealResolutionNote] = useState("");

  const {
    data: alerts = [],
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: [
      "admin-safety-alerts",
      identity.orgId,
      identity.userId,
      alertStatusFilter,
      alertTypeFilter,
    ],
    queryFn: () =>
      apiRequest<AdminSafetyAlertItem[]>("/admin/safety/alerts", identity, {
        query: {
          status: alertStatusFilter || undefined,
          alertType: alertTypeFilter || undefined,
        },
      }),
  });

  const {
    data: noShows = [],
    isLoading: noShowsLoading,
    error: noShowsError,
    refetch: refetchNoShows,
  } = useQuery({
    queryKey: ["admin-no-shows", identity.orgId, identity.userId, appealStatusFilter],
    queryFn: () =>
      apiRequest<AdminNoShowRecordItem[]>("/admin/no-shows", identity, {
        query: {
          appealStatus: appealStatusFilter || undefined,
        },
      }),
  });

  // Live Socket.IO updates for incoming SOS / route deviations / alert state changes
  useEffect(() => {
    const socket = io(buildSocketNamespaceUrl(), {
      transports: ["websocket", "polling"],
      auth: {
        organizationId: identity.orgId,
        userId: identity.userId,
        role: identity.role,
      },
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 15000,
    });

    const handleConnect = () => {
      setWsConnected(true);
      socket.emit("join", { organizationId: identity.orgId });
    };
    const handleDisconnect = () => setWsConnected(false);
    const refreshSafety = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-safety-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    };
    const refreshNoShows = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-no-shows"] });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("safety.sos", refreshSafety);
    socket.on("safety.alert.created", refreshSafety);
    socket.on("safety.alert.updated", refreshSafety);
    socket.on("no_show.appeal.resolved", refreshNoShows);

    return () => {
      socket.disconnect();
    };
  }, [identity.orgId, identity.userId, identity.role, queryClient]);

  const scanMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ scannedCount: number; createdCount: number }>("/admin/safety/run-checks", identity, {
        method: "POST",
        body: {},
      }),
    onSuccess: (res) => {
      pushToast({
        tone: res.createdCount > 0 ? "info" : "success",
        title: "Safe-Reach Escalation Check Complete",
        description: `Scanned ${res.scannedCount} completed rider(s) · ${res.createdCount} new overdue alert(s).`,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-safety-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({ tone: "error", title: "Safety check failed", description: err.message });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: ({ alertId, notes }: { alertId: string; notes?: string }) =>
      apiRequest<AdminSafetyAlertItem>(`/admin/safety/alerts/${alertId}/acknowledge`, identity, {
        method: "POST",
        body: { notes: notes || undefined },
        idempotent: true,
      }),
    onSuccess: (updated) => {
      pushToast({
        tone: "success",
        title: "Alert Acknowledged",
        description: "Escalation status moved to ACKNOWLEDGED.",
      });
      setSelectedAlert((prev) => (prev ? { ...prev, status: updated.status } : null));
      void queryClient.invalidateQueries({ queryKey: ["admin-safety-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({ tone: "error", title: "Acknowledge failed", description: err.message });
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: ({ alertId, notes }: { alertId: string; notes: string }) =>
      apiRequest<AdminSafetyAlertItem>(`/admin/safety/alerts/${alertId}/resolve`, identity, {
        method: "POST",
        body: { resolutionNotes: notes },
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Safety Alert Resolved",
        description: "Resolution logged to immutable audit trail and rider inbox.",
      });
      setSelectedAlert(null);
      setResolutionNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admin-safety-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview-badge"] });
    },
    onError: (err) => {
      pushToast({ tone: "error", title: "Resolution failed", description: err.message });
    },
  });

  const resolveAppealMutation = useMutation({
    mutationFn: ({
      noShowId,
      decision,
      note,
    }: {
      noShowId: string;
      decision: "OVERTURNED" | "UPHELD";
      note: string;
    }) =>
      apiRequest<AdminNoShowRecordItem>(`/admin/no-shows/${noShowId}/resolve-appeal`, identity, {
        method: "POST",
        body: { decision, resolutionNote: note },
        idempotent: true,
      }),
    onSuccess: (_, vars) => {
      pushToast({
        tone: "success",
        title: `Appeal ${vars.decision}`,
        description: "Employee inbox notified and audit trail recorded.",
      });
      setSelectedNoShow(null);
      setAppealResolutionNote("");
      void queryClient.invalidateQueries({ queryKey: ["admin-no-shows"] });
    },
    onError: (err) => {
      pushToast({ tone: "error", title: "Appeal decision failed", description: err.message });
    },
  });

  const openSafetyCount = useMemo(
    () => alerts.filter((a) => a.status !== "RESOLVED").length,
    [alerts],
  );
  const pendingAppealsCount = useMemo(
    () => noShows.filter((n) => n.appealStatus === "APPEALED").length,
    [noShows],
  );

  const alertColumns = useMemo<LegacyColumnDef<AdminSafetyAlertItem, unknown>[]>(
    () => [
      {
        id: "alertType",
        header: "Alert & Severity",
        cell: ({ row }) => (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setSelectedAlert(row.original);
                setResolutionNotes(row.original.resolutionNotes ?? "");
              }}
              className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {formatAlertTypeLabel(row.original.alertType)}
            </button>
            <div>
              <StatusBadge tone={severityTone(row.original.severity)}>
                {row.original.severity}
              </StatusBadge>
            </div>
          </div>
        ),
      },
      {
        id: "trip",
        header: "Trip & Cab",
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-mono font-medium tabular-nums">
              {row.original.tripCode ?? "Unlinked Trip"}
            </p>
            <p className="text-muted-foreground font-mono">
              {row.original.vehicleRegistrationNo ?? "—"}
            </p>
          </div>
        ),
      },
      {
        id: "parties",
        header: "Rider / Driver",
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-medium text-foreground">
              {row.original.employeeName ?? row.original.driverName ?? "System Detector"}
            </p>
            <p className="text-muted-foreground">
              {row.original.employeePhone ?? row.original.driverPhone ?? "Automated scan"}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge tone={alertStatusTone(row.original.status)} dot>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: "createdAt",
        header: "Raised (IST)",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatLocalTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Inspect",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              setSelectedAlert(row.original);
              setResolutionNotes(row.original.resolutionNotes ?? "");
            }}
          >
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  const noShowColumns = useMemo<LegacyColumnDef<AdminNoShowRecordItem, unknown>[]>(
    () => [
      {
        id: "employee",
        header: "Commuter",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedNoShow(row.original);
                setAppealResolutionNote(row.original.appealResolutionNote ?? "");
              }}
              className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {row.original.employeeName}
            </button>
            <p className="font-mono text-[11px] text-muted-foreground">
              {row.original.employeeCode}
            </p>
          </div>
        ),
      },
      {
        id: "trip",
        header: "Trip & Stop",
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <p className="font-mono font-medium tabular-nums">{row.original.tripCode}</p>
            <p className="text-muted-foreground">{row.original.stopLocationName}</p>
          </div>
        ),
      },
      {
        id: "evidence",
        header: "Geofence & Wait Proof",
        cell: ({ row }) => (
          <div className="space-y-0.5 font-mono text-xs tabular-nums">
            <p>
              {row.original.waitedSeconds}s waited ·{" "}
              {row.original.distanceFromStopM != null ? `${row.original.distanceFromStopM}m` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {row.original.reasonCode} · {row.original.geofenceVerified ? "Geofence OK" : "Unverified"}
            </p>
          </div>
        ),
      },
      {
        id: "appealStatus",
        header: "Appeal State",
        cell: ({ row }) => (
          <StatusBadge tone={appealTone(row.original.appealStatus)} dot>
            {row.original.appealStatus}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "Adjudicate",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              setSelectedNoShow(row.original);
              setAppealResolutionNote(row.original.appealResolutionNote ?? "");
            }}
          >
            Inspect
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <AdminShell
      title="Safety Escalations & No-Show Appeals"
      subtitle="SOS triage, route detectors & no-show audits"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={wsConnected ? "emerald" : "amber"} dot>
            {wsConnected ? "Live Socket" : "Reconnecting"}
          </StatusBadge>
          {canApprove && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Safe-Reach Check
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchAlerts();
              void refetchNoShows();
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Workbench Switcher */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("SAFETY")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-harbor)] active:scale-[0.97]",
            tab === "SAFETY"
              ? "border-primary bg-[#EFF6FF] text-[#1D4ED8]"
              : "border-border bg-card text-foreground hover:bg-muted/60",
          )}
        >
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          <span>Safety Escalations</span>
          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
            {openSafetyCount} open
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab("NO_SHOWS")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-harbor)] active:scale-[0.97]",
            tab === "NO_SHOWS"
              ? "border-primary bg-[#EFF6FF] text-[#1D4ED8]"
              : "border-border bg-card text-foreground hover:bg-muted/60",
          )}
        >
          <Gavel className="size-3.5" aria-hidden="true" />
          <span>No-Show Appeals</span>
          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
            {pendingAppealsCount} pending
          </span>
        </button>
      </div>

      {tab === "SAFETY" ? (
        <div className="space-y-4">
          {alertsError && (
            <QueryErrorBanner message={alertsError.message} onRetry={() => void refetchAlerts()} />
          )}

          <ManifestCard className="p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor={alertStatusSelectId}>Alert Status</FieldLabel>
                <Select
                  id={alertStatusSelectId}
                  className="mt-1"
                  value={alertStatusFilter}
                  onChange={(e) => setAlertStatusFilter(e.target.value as "" | SafetyAlertStatus)}
                >
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open (Unacknowledged)</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="RESOLVED">Resolved</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor={alertTypeSelectId}>Escalation Type</FieldLabel>
                <Select
                  id={alertTypeSelectId}
                  className="mt-1"
                  value={alertTypeFilter}
                  onChange={(e) => setAlertTypeFilter(e.target.value as "" | SafetyAlertType)}
                >
                  <option value="">All Types</option>
                  <option value="SOS">Emergency SOS</option>
                  <option value="ROUTE_DEVIATION">Route Deviation</option>
                  <option value="LONG_STOPPAGE">Unscheduled Stoppage</option>
                  <option value="SAFE_REACH_OVERDUE">Safe Reach Overdue</option>
                </Select>
              </div>
              <div className="flex items-end text-xs text-muted-foreground pb-1.5 font-mono tabular-nums">
                Showing {alerts.length} escalation alert(s)
              </div>
            </div>
          </ManifestCard>

          <ManifestCard>
            <ManifestHeader
              title="Tenant Safety Escalation Queue"
              description="Click any escalation to review GPS coordinates, acknowledge dispatch response, or resolve cleanly."
            />
            <DataLedger
              columns={alertColumns}
              data={alerts}
              isLoading={alertsLoading}
              emptyTitle="Zero matching safety escalations"
              emptyDescription="All SOS triggers, route deviations, stoppages, and safe-reach checks are clear."
            />
          </ManifestCard>
        </div>
      ) : (
        <div className="space-y-4">
          {noShowsError && (
            <QueryErrorBanner message={noShowsError.message} onRetry={() => void refetchNoShows()} />
          )}

          <ManifestCard className="p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor={appealFilterSelectId}>Appeal Filter</FieldLabel>
                <Select
                  id={appealFilterSelectId}
                  className="mt-1"
                  value={appealStatusFilter}
                  onChange={(e) =>
                    setAppealStatusFilter(e.target.value as "" | NoShowAppealStatus)
                  }
                >
                  <option value="">All No-Show Records</option>
                  <option value="APPEALED">Pending Employee Appeals</option>
                  <option value="OVERTURNED">Overturned Appeals</option>
                  <option value="UPHELD">Upheld No-Shows</option>
                  <option value="NONE">Unappealed</option>
                </Select>
              </div>
              <div className="flex items-end text-xs text-muted-foreground pb-1.5 font-mono tabular-nums">
                {noShows.length} recorded no-show incident(s)
              </div>
            </div>
          </ManifestCard>

          <ManifestCard>
            <ManifestHeader
              title="Geofenced No-Show Appeals Ledger"
              description="Inspect wait-timer seconds and pickup geofence distance before overturning or upholding an appeal."
            />
            <DataLedger
              columns={noShowColumns}
              data={noShows}
              isLoading={noShowsLoading}
              emptyTitle="No matching no-show records"
              emptyDescription="Driver no-shows and contested employee appeals appear here with objective proof."
            />
          </ManifestCard>
        </div>
      )}

      {/* Safety Alert Triage Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert ? formatAlertTypeLabel(selectedAlert.alertType) : "Safety Alert"}
        subtitle={selectedAlert ? `${selectedAlert.tripCode ?? "System Alert"} · ${selectedAlert.id.slice(0, 8)}` : undefined}
      >
        {selectedAlert && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={severityTone(selectedAlert.severity)}>
                {selectedAlert.severity}
              </StatusBadge>
              <StatusBadge tone={alertStatusTone(selectedAlert.status)} dot>
                {selectedAlert.status}
              </StatusBadge>
              <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                {formatLocalTime(selectedAlert.createdAt)}
              </span>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-foreground">Incident Summary</p>
              <p className="text-muted-foreground">{selectedAlert.notes ?? "No notes attached."}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-muted-foreground">Reported Party</p>
                <p className="font-medium">
                  {selectedAlert.employeeName ?? selectedAlert.driverName ?? "Automated Monitor"}
                </p>
                <p className="font-mono text-muted-foreground">
                  {selectedAlert.employeePhone ?? selectedAlert.driverPhone ?? "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-muted-foreground">Trip & Coordinates</p>
                <p className="font-mono font-medium">
                  {selectedAlert.tripCode ?? "No trip"} · {selectedAlert.vehicleRegistrationNo ?? "—"}
                </p>
                {selectedAlert.latitude != null && selectedAlert.longitude != null ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedAlert.latitude},${selectedAlert.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                  >
                    <MapPin className="size-3" aria-hidden="true" />
                    {selectedAlert.latitude.toFixed(5)}, {selectedAlert.longitude.toFixed(5)}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="text-muted-foreground">No GPS coordinates captured</p>
                )}
              </div>
            </div>

            {selectedAlert.tripId && (
              <Link
                href={`/trips/${selectedAlert.tripId}`}
                className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
              >
                Inspect Trip Manifest & Timeline
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Link>
            )}

            {canApprove && selectedAlert.status !== "RESOLVED" && (
              <div className="border-t border-border pt-4 space-y-3">
                {selectedAlert.status === "OPEN" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      acknowledgeMutation.mutate({
                        alertId: selectedAlert.id,
                        notes: resolutionNotes.trim() || undefined,
                      })
                    }
                    disabled={acknowledgeMutation.isPending}
                  >
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    Acknowledge Escalation
                  </Button>
                )}

                <div>
                  <FieldLabel htmlFor={resolutionNoteId}>Resolution Audit Note</FieldLabel>
                  <Textarea
                    id={resolutionNoteId}
                    rows={3}
                    className="mt-1"
                    placeholder="Document response action taken (e.g., called rider/driver, backup cab sent)..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={resolutionNotes.trim().length < 3 || resolveAlertMutation.isPending}
                  onClick={() =>
                    resolveAlertMutation.mutate({
                      alertId: selectedAlert.id,
                      notes: resolutionNotes.trim(),
                    })
                  }
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Mark Alert Resolved
                </Button>
              </div>
            )}

            {selectedAlert.status === "RESOLVED" && (
              <div className="rounded-lg border border-[#99F6E4] bg-[#F0FDFA] p-3 text-xs space-y-1">
                <p className="font-semibold text-[#0F766E]">
                  Resolved by {selectedAlert.resolvedByName ?? "Transport Ops"} ·{" "}
                  {selectedAlert.resolvedAt ? formatLocalTime(selectedAlert.resolvedAt) : "—"}
                </p>
                <p className="text-[#0F2544]">{selectedAlert.resolutionNotes ?? "—"}</p>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>

      {/* No-Show Appeal Adjudication Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedNoShow)}
        onClose={() => setSelectedNoShow(null)}
        title={selectedNoShow ? `No-Show · ${selectedNoShow.employeeName}` : "No-Show Review"}
        subtitle={
          selectedNoShow
            ? `${selectedNoShow.tripCode} · ${selectedNoShow.stopLocationName}`
            : undefined
        }
      >
        {selectedNoShow && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge tone={appealTone(selectedNoShow.appealStatus)} dot>
                Appeal: {selectedNoShow.appealStatus}
              </StatusBadge>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                Marked {formatLocalTime(selectedNoShow.markedAt)}
              </span>
            </div>

            <div className="rounded-lg border border-border p-3 text-xs space-y-1.5">
              <p className="font-semibold">Objective Driver & Geofence Proof</p>
              <p className="font-mono tabular-nums">
                Reason: {selectedNoShow.reasonCode} · Wait: {selectedNoShow.waitedSeconds}s ·
                Distance:{" "}
                {selectedNoShow.distanceFromStopM != null
                  ? `${selectedNoShow.distanceFromStopM}m`
                  : "—"}
              </p>
              {selectedNoShow.driverNotes && (
                <p className="text-muted-foreground">Driver note: {selectedNoShow.driverNotes}</p>
              )}
            </div>

            {selectedNoShow.appealNote && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold">Employee Appeal Statement</p>
                <p className="text-foreground">{selectedNoShow.appealNote}</p>
              </div>
            )}

            {canApprove && selectedNoShow.appealStatus === "APPEALED" && (
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <FieldLabel htmlFor={appealNoteId}>Adjudication Resolution Note</FieldLabel>
                  <Textarea
                    id={appealNoteId}
                    rows={3}
                    className="mt-1"
                    placeholder="Record why this no-show is overturned or upheld..."
                    value={appealResolutionNote}
                    onChange={(e) => setAppealResolutionNote(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      appealResolutionNote.trim().length < 3 || resolveAppealMutation.isPending
                    }
                    onClick={() =>
                      resolveAppealMutation.mutate({
                        noShowId: selectedNoShow.id,
                        decision: "UPHELD",
                        note: appealResolutionNote.trim(),
                      })
                    }
                  >
                    Uphold No-Show
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      appealResolutionNote.trim().length < 3 || resolveAppealMutation.isPending
                    }
                    onClick={() =>
                      resolveAppealMutation.mutate({
                        noShowId: selectedNoShow.id,
                        decision: "OVERTURNED",
                        note: appealResolutionNote.trim(),
                      })
                    }
                  >
                    Overturn (Credit)
                  </Button>
                </div>
              </div>
            )}

            {selectedNoShow.appealResolutionNote && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold">Recorded Resolution</p>
                <p>{selectedNoShow.appealResolutionNote}</p>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>
    </AdminShell>
  );
}
