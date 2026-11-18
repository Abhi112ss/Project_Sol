"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Save, Shield } from "lucide-react";
import { apiRequest, apiRequestWithMeta, formatLocalTime } from "@/lib/api";
import type {
  AuditLogItem,
  CanonicalLocalityItem,
  OrganizationDetail,
  OrganizationSettings,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { QueryErrorBanner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface PolicyFormState {
  defaultGeofenceRadiusM: string;
  noShowWaitSeconds: string;
  bookingCutoffMinutes: string;
  cancellationCutoffMinutes: string;
  requireBoardingOtp: boolean;
  requireDeboardingOtp: boolean;
  gpsStaleThresholdSeconds: string;
  gpsRetentionDays: string;
  gpsPingIntervalSeconds: string;
  nearbyLocalityRadiusM: string;
  maxRouteDetourRatio: string;
  pickupWindowToleranceMinutes: string;
  driverTurnaroundBufferMinutes: string;
  arriveBySafetyBufferMinutes: string;
  allowSameDayBooking: boolean;
  currencyCode: string;
}

function toPolicyState(s?: OrganizationSettings | null): PolicyFormState {
  if (!s) {
    return {
      defaultGeofenceRadiusM: "150",
      noShowWaitSeconds: "180",
      bookingCutoffMinutes: "120",
      cancellationCutoffMinutes: "60",
      requireBoardingOtp: true,
      requireDeboardingOtp: false,
      gpsStaleThresholdSeconds: "45",
      gpsRetentionDays: "90",
      gpsPingIntervalSeconds: "10",
      nearbyLocalityRadiusM: "4000",
      maxRouteDetourRatio: "1.75",
      pickupWindowToleranceMinutes: "15",
      driverTurnaroundBufferMinutes: "20",
      arriveBySafetyBufferMinutes: "10",
      allowSameDayBooking: false,
      currencyCode: "INR",
    };
  }
  return {
    defaultGeofenceRadiusM: String(s.defaultGeofenceRadiusM),
    noShowWaitSeconds: String(s.noShowWaitSeconds),
    bookingCutoffMinutes: String(s.bookingCutoffMinutes),
    cancellationCutoffMinutes: String(s.cancellationCutoffMinutes),
    requireBoardingOtp: s.requireBoardingOtp,
    requireDeboardingOtp: s.requireDeboardingOtp,
    gpsStaleThresholdSeconds: String(s.gpsStaleThresholdSeconds),
    gpsRetentionDays: String(s.gpsRetentionDays),
    gpsPingIntervalSeconds: String(s.gpsPingIntervalSeconds),
    nearbyLocalityRadiusM: String(s.nearbyLocalityRadiusM ?? 4000),
    maxRouteDetourRatio: String(s.maxRouteDetourRatio ?? 1.75),
    pickupWindowToleranceMinutes: String(s.pickupWindowToleranceMinutes ?? 15),
    driverTurnaroundBufferMinutes: String(s.driverTurnaroundBufferMinutes ?? 20),
    arriveBySafetyBufferMinutes: String(s.arriveBySafetyBufferMinutes ?? 10),
    allowSameDayBooking: s.allowSameDayBooking ?? false,
    currencyCode: s.currencyCode,
  };
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const { identity, canEditOrgSettings } = useDevSession();
  const { pushToast } = useToast();
  const [auditPage, setAuditPage] = useState(1);

  const {
    data: orgDetail,
    isLoading: orgLoading,
    error: orgError,
    refetch: refetchOrg,
  } = useQuery({
    queryKey: ["organization-detail", identity.orgId, identity.userId, identity.role],
    queryFn: () =>
      apiRequest<OrganizationDetail>(`/admin/organizations/${identity.orgId}`, identity),
  });

  const {
    data: auditResult,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: [
      "audit-logs",
      identity.orgId,
      identity.userId,
      identity.role,
      auditPage,
    ],
    queryFn: () =>
      apiRequestWithMeta<AuditLogItem[]>("/admin/audit-logs", identity, {
        query: { page: auditPage, limit: 15 },
      }),
    retry: false,
  });

  const [policyDraft, setPolicyDraft] = useState<PolicyFormState | null>(null);
  const [newLoc, setNewLoc] = useState({
    canonicalName: "",
    aliasesText: "",
    centerLatitude: "17.4450",
    centerLongitude: "78.3816",
    proximityRadiusM: "3500",
  });

  const { data: localities = [], refetch: refetchLocalities } = useQuery({
    queryKey: ["localities", identity.orgId, identity.userId, identity.role],
    queryFn: () =>
      apiRequest<CanonicalLocalityItem[]>("/admin/localities", identity),
  });

  const createLocalityMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<CanonicalLocalityItem>("/admin/localities", identity, {
        method: "POST",
        body: payload,
        idempotent: true,
      }),
    onSuccess: (created) => {
      pushToast({
        tone: "success",
        title: `Locality ${created.canonicalName} registered`,
        description: `${created.aliases.length} alias(es) mapped with ${created.proximityRadiusM}m PostGIS radius.`,
      });
      setNewLoc((p) => ({ ...p, canonicalName: "", aliasesText: "" }));
      void refetchLocalities();
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Locality save failed",
        description: err.message,
      });
    },
  });

  const policy = policyDraft ?? toPolicyState(orgDetail?.settings);
  const setPolicy = (updater: (prev: PolicyFormState) => PolicyFormState) => {
    setPolicyDraft(updater(policy));
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest(`/admin/organizations/${identity.orgId}/settings`, identity, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Tenant transport policies saved",
        description: "Cutoffs, OTP verification, and GPS cadence updated.",
      });
      setPolicyDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["organization-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Failed to save settings",
        description: err.message,
      });
    },
  });

  const submitPolicy = (event: React.FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({
      defaultGeofenceRadiusM: Number(policy.defaultGeofenceRadiusM),
      noShowWaitSeconds: Number(policy.noShowWaitSeconds),
      bookingCutoffMinutes: Number(policy.bookingCutoffMinutes),
      cancellationCutoffMinutes: Number(policy.cancellationCutoffMinutes),
      requireBoardingOtp: policy.requireBoardingOtp,
      requireDeboardingOtp: policy.requireDeboardingOtp,
      gpsStaleThresholdSeconds: Number(policy.gpsStaleThresholdSeconds),
      gpsRetentionDays: Number(policy.gpsRetentionDays),
      gpsPingIntervalSeconds: Number(policy.gpsPingIntervalSeconds),
      nearbyLocalityRadiusM: Number(policy.nearbyLocalityRadiusM),
      maxRouteDetourRatio: Number(policy.maxRouteDetourRatio),
      pickupWindowToleranceMinutes: Number(policy.pickupWindowToleranceMinutes),
      driverTurnaroundBufferMinutes: Number(policy.driverTurnaroundBufferMinutes),
      arriveBySafetyBufferMinutes: Number(policy.arriveBySafetyBufferMinutes),
      allowSameDayBooking: policy.allowSameDayBooking,
      currencyCode: policy.currencyCode.toUpperCase(),
    });
  };

  const auditLogs = auditResult?.data ?? [];
  const auditPagination = auditResult?.pagination;

  return (
    <AdminShell
      title="Settings & Audit Trail"
      subtitle="Configure tenant geofence radius, no-show wait duration, boarding OTP policy, and review immutable logs"
    >
      <div className="space-y-5">
        {orgError && (
          <QueryErrorBanner
            message={orgError.message}
            onRetry={() => void refetchOrg()}
          />
        )}

        {/* Policy Settings Form */}
        <ManifestCard>
          <ManifestHeader
            title={
              orgDetail
                ? `${orgDetail.name} · ${orgDetail.slug}`
                : "Organization Transport Policy"
            }
            description={
              orgDetail
                ? `Timezone: ${orgDetail.timezone} · Currency: ${policy.currencyCode}`
                : "Enforced across dispatch, driver check-in, and employee booking windows"
            }
            actions={
              !canEditOrgSettings ? (
                <StatusBadge tone="amber">
                  <Shield className="size-3" aria-hidden="true" />
                  ORG_ADMIN required to save
                </StatusBadge>
              ) : undefined
            }
          />
          {orgLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <form onSubmit={submitPolicy} className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <FieldLabel htmlFor="set-geo">
                    Geofence Radius (m)
                  </FieldLabel>
                  <Input
                    id="set-geo"
                    type="number"
                    min={25}
                    max={2000}
                    disabled={!canEditOrgSettings}
                    value={policy.defaultGeofenceRadiusM}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        defaultGeofenceRadiusM: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-wait">
                    No-Show Wait Timer (sec)
                  </FieldLabel>
                  <Input
                    id="set-wait"
                    type="number"
                    min={30}
                    max={1800}
                    disabled={!canEditOrgSettings}
                    value={policy.noShowWaitSeconds}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        noShowWaitSeconds: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-book">
                    Booking Cutoff (min)
                  </FieldLabel>
                  <Input
                    id="set-book"
                    type="number"
                    min={15}
                    max={1440}
                    disabled={!canEditOrgSettings}
                    value={policy.bookingCutoffMinutes}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        bookingCutoffMinutes: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-cancel">
                    Cancellation Cutoff (min)
                  </FieldLabel>
                  <Input
                    id="set-cancel"
                    type="number"
                    min={5}
                    max={720}
                    disabled={!canEditOrgSettings}
                    value={policy.cancellationCutoffMinutes}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        cancellationCutoffMinutes: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="set-stale">
                    GPS Stale Threshold (sec)
                  </FieldLabel>
                  <Input
                    id="set-stale"
                    type="number"
                    min={15}
                    max={600}
                    disabled={!canEditOrgSettings}
                    value={policy.gpsStaleThresholdSeconds}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        gpsStaleThresholdSeconds: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-ping">
                    GPS Ping Interval (sec)
                  </FieldLabel>
                  <Input
                    id="set-ping"
                    type="number"
                    min={5}
                    max={120}
                    disabled={!canEditOrgSettings}
                    value={policy.gpsPingIntervalSeconds}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        gpsPingIntervalSeconds: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-ret">
                    GPS Retention (days)
                  </FieldLabel>
                  <Input
                    id="set-ret"
                    type="number"
                    min={7}
                    max={365}
                    disabled={!canEditOrgSettings}
                    value={policy.gpsRetentionDays}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        gpsRetentionDays: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-curr">Currency Code</FieldLabel>
                  <Input
                    id="set-curr"
                    maxLength={8}
                    disabled={!canEditOrgSettings}
                    value={policy.currencyCode}
                    onChange={(e) =>
                      setPolicy((p) => ({ ...p, currencyCode: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 border-t border-border pt-3.5">
                <div>
                  <FieldLabel htmlFor="set-nearby-radius">
                    Nearby Locality Merge Radius (m)
                  </FieldLabel>
                  <Input
                    id="set-nearby-radius"
                    type="number"
                    min={200}
                    max={20000}
                    disabled={!canEditOrgSettings}
                    value={policy.nearbyLocalityRadiusM}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        nearbyLocalityRadiusM: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-detour">
                    Max Shared Detour Ratio
                  </FieldLabel>
                  <Input
                    id="set-detour"
                    type="number"
                    step="0.05"
                    min={1.05}
                    max={5}
                    disabled={!canEditOrgSettings}
                    value={policy.maxRouteDetourRatio}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        maxRouteDetourRatio: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-window-tol">
                    Pickup Window Tolerance (min)
                  </FieldLabel>
                  <Input
                    id="set-window-tol"
                    type="number"
                    min={5}
                    max={120}
                    disabled={!canEditOrgSettings}
                    value={policy.pickupWindowToleranceMinutes}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        pickupWindowToleranceMinutes: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-turnaround">
                    Driver Turnaround Buffer (min)
                  </FieldLabel>
                  <Input
                    id="set-turnaround"
                    type="number"
                    min={0}
                    max={180}
                    disabled={!canEditOrgSettings}
                    value={policy.driverTurnaroundBufferMinutes}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        driverTurnaroundBufferMinutes: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-arrive-buf">
                    Arrive-By Safety Buffer (min)
                  </FieldLabel>
                  <Input
                    id="set-arrive-buf"
                    type="number"
                    min={0}
                    max={60}
                    disabled={!canEditOrgSettings}
                    value={policy.arriveBySafetyBufferMinutes}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        arriveBySafetyBufferMinutes: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="set-same-day">
                    Same-Day Employee Bookings
                  </FieldLabel>
                  <Select
                    id="set-same-day"
                    disabled={!canEditOrgSettings}
                    value={String(policy.allowSameDayBooking)}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        allowSameDayBooking: e.target.value === "true",
                      }))
                    }
                  >
                    <option value="false">Advance notice required (Blocked same day)</option>
                    <option value="true">Allowed (subject to cutoff minutes)</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-border pt-3.5">
                <div>
                  <FieldLabel htmlFor="set-botp">
                    Boarding OTP Verification
                  </FieldLabel>
                  <Select
                    id="set-botp"
                    disabled={!canEditOrgSettings}
                    value={String(policy.requireBoardingOtp)}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        requireBoardingOtp: e.target.value === "true",
                      }))
                    }
                  >
                    <option value="true">Required (4-digit rider OTP)</option>
                    <option value="false">Disabled</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="set-dotp">
                    Deboarding OTP Verification
                  </FieldLabel>
                  <Select
                    id="set-dotp"
                    disabled={!canEditOrgSettings}
                    value={String(policy.requireDeboardingOtp)}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        requireDeboardingOtp: e.target.value === "true",
                      }))
                    }
                  >
                    <option value="false">Optional (Geofence confirmation)</option>
                    <option value="true">Required</option>
                  </Select>
                </div>
              </div>

              {canEditOrgSettings && (
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                    <Save className="size-3.5" aria-hidden="true" />
                    {saveMutation.isPending ? "Saving..." : "Save Tenant Policies"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </ManifestCard>

        {/* Canonical Localities Registry */}
        <ManifestCard>
          <ManifestHeader
            title="Canonical Pickup & Operational Localities"
            description="Normalize spelling aliases (e.g., Chintal -> Chinthal) and PostGIS center zones used for driver matching and grouping"
          />
          <div className="p-4 space-y-4">
            {canEditOrgSettings && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newLoc.canonicalName.trim()) return;
                  createLocalityMutation.mutate({
                    canonicalName: newLoc.canonicalName.trim(),
                    aliases: newLoc.aliasesText
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    centerLatitude: Number(newLoc.centerLatitude),
                    centerLongitude: Number(newLoc.centerLongitude),
                    proximityRadiusM: Number(newLoc.proximityRadiusM),
                  });
                }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 rounded-lg border border-border bg-[#F8FAFC] p-3 items-end"
              >
                <div className="lg:col-span-1">
                  <FieldLabel htmlFor="loc-name" required>
                    Canonical Name
                  </FieldLabel>
                  <Input
                    id="loc-name"
                    required
                    placeholder="Madhapur"
                    value={newLoc.canonicalName}
                    onChange={(e) =>
                      setNewLoc((p) => ({ ...p, canonicalName: e.target.value }))
                    }
                  />
                </div>
                <div className="lg:col-span-2">
                  <FieldLabel htmlFor="loc-aliases">
                    Spelling Aliases (comma-separated)
                  </FieldLabel>
                  <Input
                    id="loc-aliases"
                    placeholder="Madhapur Metro, Mindspace, Hitec"
                    value={newLoc.aliasesText}
                    onChange={(e) =>
                      setNewLoc((p) => ({ ...p, aliasesText: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="loc-lat" required>
                    Center Lat
                  </FieldLabel>
                  <Input
                    id="loc-lat"
                    type="number"
                    step="0.0001"
                    required
                    value={newLoc.centerLatitude}
                    onChange={(e) =>
                      setNewLoc((p) => ({ ...p, centerLatitude: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="loc-lng" required>
                    Center Lng
                  </FieldLabel>
                  <Input
                    id="loc-lng"
                    type="number"
                    step="0.0001"
                    required
                    value={newLoc.centerLongitude}
                    onChange={(e) =>
                      setNewLoc((p) => ({ ...p, centerLongitude: e.target.value }))
                    }
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <FieldLabel htmlFor="loc-rad" required>
                      Radius (m)
                    </FieldLabel>
                    <Input
                      id="loc-rad"
                      type="number"
                      min={200}
                      max={20000}
                      required
                      value={newLoc.proximityRadiusM}
                      onChange={(e) =>
                        setNewLoc((p) => ({
                          ...p,
                          proximityRadiusM: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createLocalityMutation.isPending}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add
                  </Button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {localities.map((loc) => (
                <div
                  key={loc.id}
                  className="rounded-lg border border-border p-3 bg-card text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground inline-flex items-center gap-1">
                      <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                      {loc.canonicalName}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {(loc.proximityRadiusM / 1000).toFixed(1)} km
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Aliases: {loc.aliases.join(", ") || "—"}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {loc.centerLatitude.toFixed(4)}, {loc.centerLongitude.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ManifestCard>

        {/* Immutable Audit Logs */}
        <ManifestCard>
          <ManifestHeader
            title="Immutable Organization Audit Trail"
            description="Tracks bookings, approvals, manual dispatch modifications, driver suspensions, and settings updates"
            actions={
              auditPagination && (
                <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
                  <span>
                    Page {auditPagination.page} /{" "}
                    {Math.max(1, auditPagination.totalPages)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={auditPage >= auditPagination.totalPages}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )
            }
          />
          {auditError ? (
            <div className="p-4">
              <QueryErrorBanner message={auditError.message} />
            </div>
          ) : auditLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="px-4 py-8 text-xs text-muted-foreground">
              No audit log entries found for this tenant.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-[#F8FAFC] text-[11px] font-semibold text-muted-foreground">
                    <th className="px-4 py-2.5">Timestamp (IST)</th>
                    <th className="px-4 py-2.5">Action</th>
                    <th className="px-4 py-2.5">Actor Role</th>
                    <th className="px-4 py-2.5">Entity</th>
                    <th className="px-4 py-2.5">Reason / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F7FAFF]">
                      <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatLocalTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-2 font-mono font-semibold text-foreground">
                        {log.action}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge tone="neutral">
                          {log.actorRole ?? "SYSTEM"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums">
                        {log.entityType}:{log.entityId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {log.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ManifestCard>
      </div>
    </AdminShell>
  );
}
