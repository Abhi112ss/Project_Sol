"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Radio, FileBarChart2, Receipt } from "lucide-react";
import { apiRequest, formatInrFromPaise } from "@/lib/api";
import type { OverviewData, VendorItem } from "@/lib/types";
import { useDevSession } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export function LiveTrackingRoadmapView() {
  const { identity } = useDevSession();
  const { data } = useQuery({
    queryKey: ["overview-tracking", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OverviewData>("/admin/overview", identity),
  });

  const activeTrips = (data?.recentTrips ?? []).filter(
    (t) =>
      t.status === "ASSIGNED" ||
      t.status === "DRIVER_ACCEPTED" ||
      t.status === "IN_PROGRESS",
  );

  return (
    <AdminShell
      title="Live Fleet Tracking"
      subtitle="Socket.IO vehicle telemetry, OSM Leaflet cab markers, and GPS staleness alerts unlock in Phase 5"
    >
      <div className="space-y-4">
        <ManifestCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <Radio className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold text-foreground">
                  Real-Time Vehicle Telemetry & Safety Console
                </h2>
                <StatusBadge tone="cobalt">Phase 5 Release Gate</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                Phase 2 dispatches and monitors scheduled trips in PostgreSQL. Live
                OpenStreetMap Leaflet pins, Socket.IO /ws/transport room feeds,
                geofence entry banners, and stale-GPS indicators wire in during Phase 5
                alongside driver telemetry ingestion.
              </p>
            </div>
            <Link href="/dispatch" className={buttonVariants({ size: "sm" })}>
              Dispatch Trips Now
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </ManifestCard>

        <ManifestCard>
          <ManifestHeader
            title="Current Active & Assigned Trip Manifests"
            description={`${activeTrips.length} dispatched trip(s) in Postgres awaiting live GPS pings`}
          />
          {activeTrips.length === 0 ? (
            <p className="px-4 py-8 text-xs text-muted-foreground">
              No active trips in flight right now. Publish a trip in Dispatch Workbench to see it here.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {activeTrips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trips/${trip.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[#F7FAFF]"
                >
                  <div>
                    <span className="font-mono font-semibold text-primary tabular-nums">
                      {trip.tripCode}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {trip.driverName ?? "Unassigned"} ·{" "}
                      {trip.vehicleRegistrationNo ?? "No cab"}
                    </span>
                  </div>
                  <StatusBadge tone={statusToneFor(trip.status)} dot>
                    {trip.status}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </ManifestCard>
      </div>
    </AdminShell>
  );
}

export function ReportsRoadmapView() {
  const { identity } = useDevSession();
  const { data } = useQuery({
    queryKey: ["overview-reports", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OverviewData>("/admin/overview", identity),
  });

  return (
    <AdminShell
      title="Operational Analytics & SLA Reports"
      subtitle="On-time pickup percentiles, wait-time attribution charts, and CSV/PDF/Excel exports unlock in Phase 7"
    >
      <ManifestCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <FileBarChart2 className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">
                SLA Reporting & Delay Decomposition Workbench
              </h2>
              <StatusBadge tone="amber">Phase 7 Release Gate</StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              Per-passenger arrival delay and passenger wait seconds are already
              captured on every trip in Phase 2 (Trips & Inspector). Aggregated shift
              charts, vendor OTP compliance scorecards, and scheduled CSV/PDF exports
              arrive in Phase 7.
            </p>
          </div>
          <Link
            href="/trips"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Inspect Trip Delay Metrics
          </Link>
        </div>

        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Completed Trips</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {data.kpis.completedTrips}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Delayed Pickups</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {data.kpis.delayedPickups}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Verified No-Shows</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {data.kpis.noShowPassengers}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Cancelled Trips</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {data.kpis.cancelledTrips}
              </p>
            </div>
          </div>
        )}
      </ManifestCard>
    </AdminShell>
  );
}

export function BillingRoadmapView() {
  const { identity } = useDevSession();
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-billing", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VendorItem[]>("/admin/vendors", identity),
  });

  return (
    <AdminShell
      title="Vendor Billing & Reconciliation"
      subtitle="Monthly trip reconciliation ledgers, penalty deductions, and invoice exports unlock in Phase 7"
    >
      <div className="space-y-4">
        <ManifestCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <Receipt className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold text-foreground">
                  Vendor Settlement & Tariff Reconciliation
                </h2>
                <StatusBadge tone="amber">Phase 7 Release Gate</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                Base trip fees and per-kilometer rates are configured today in Vendors & Shifts. Automated invoice generation and reconciliation dispute tracking ship in Phase 7.
              </p>
            </div>
            <Link
              href="/vendors"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit Vendor Tariff Cards
            </Link>
          </div>
        </ManifestCard>

        <ManifestCard>
          <ManifestHeader
            title="Active Vendor Rate Schedules (INR)"
            description="Configured paise rate cards used for downstream Phase 7 settlement math"
          />
          <div className="divide-y divide-border">
            {vendors.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-foreground">{v.name}</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {v.code} · {v.contactName}
                  </p>
                </div>
                <div className="font-mono text-xs text-right tabular-nums">
                  <p className="font-semibold text-foreground">
                    {formatInrFromPaise(v.billingBaseTripPaise)} base
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
    </AdminShell>
  );
}

