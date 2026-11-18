"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CarFront,
  CheckSquare,
  Clock,
  GitBranch,
  ShieldAlert,
  UserCheck,
  UserX,
} from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type { OverviewData } from "@/lib/types";
import { useDevSession } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, QueryErrorBanner } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewView() {
  const { identity } = useDevSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OverviewData>("/admin/overview", identity),
  });

  const kpis = data?.kpis;

  const kpiCards = [
    {
      label: "Active trips",
      value: kpis?.activeTrips ?? 0,
      href: "/trips",
      icon: Activity,
      note: "Active or assigned rides",
    },
    {
      label: "Pending approvals",
      value: kpis?.pendingApprovals ?? 0,
      href: "/approvals",
      icon: CheckSquare,
      note: "Awaiting duty sign-off",
    },
    {
      label: "Awaiting dispatch",
      value: kpis?.approvedAwaitingDispatch ?? 0,
      href: "/dispatch",
      icon: GitBranch,
      note: "Ready for cab grouping",
    },
    {
      label: "Delayed pickups",
      value: kpis?.delayedPickups ?? 0,
      href: "/trips",
      icon: Clock,
      note: "Arrival delay > 120s",
    },
    {
      label: "Active drivers",
      value: kpis?.activeDrivers ?? 0,
      href: "/drivers",
      icon: UserCheck,
      note: "Active fleet chauffeurs",
    },
    {
      label: "Available vehicles",
      value: kpis?.availableVehicles ?? 0,
      href: "/vehicles",
      icon: CarFront,
      note: `${kpis?.assignedVehicles ?? 0} currently on trip`,
    },
    {
      label: "No-show passengers",
      value: kpis?.noShowPassengers ?? 0,
      href: "/trips",
      icon: UserX,
      note: "Wait-timer no-shows",
    },
    {
      label: "Open emergencies",
      value: kpis?.activeEmergencies ?? 0,
      href: "/trips",
      icon: ShieldAlert,
      note: "Unresolved SOS beacons",
    },
  ];

  return (
    <AdminShell
      title="Operations Overview"
      subtitle={`Dispatch telemetry · ${identity.orgName}`}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/approvals"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Approvals
          </Link>
          <Link href="/dispatch" className={buttonVariants({ size: "sm" })}>
            Dispatch Workbench
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <QueryErrorBanner
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {/* 8-Tile KPI Strip (strict 4 columns on desktop) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                href={card.href}
                className="group rounded-[10px] border border-border bg-card p-4 transition-[border-color,background-color] duration-150 hover:border-[#93C5FD] hover:bg-[#FAFBFD]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {card.label}
                  </span>
                  <Icon
                    className="size-4 text-muted-foreground group-hover:text-primary transition-colors duration-150"
                    aria-hidden="true"
                  />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-2 h-8 w-16" />
                ) : (
                  <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    {card.value}
                  </p>
                )}
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {card.note}
                </p>
              </Link>
            );
          })}
        </div>

        {/* Middle Row: Configured Shifts + Open Safety Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <ManifestCard className="lg:col-span-7">
            <ManifestHeader
              title="Configured Shift Windows"
              description="Daily Hyderabad campus login and logout dispatch cutoffs"
              actions={
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Manage shifts
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !data?.upcomingShifts.length ? (
              <EmptyState
                title="No shifts configured"
                description="Add a login or logout shift definition under Vendors & Shifts."
              />
            ) : (
              <div className="divide-y divide-border">
                {data.upcomingShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
                        {shift.code}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {shift.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          {shift.daysOfWeek}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                        {shift.shiftTimeLocal} IST
                      </span>
                      <StatusBadge tone={statusToneFor(shift.direction)}>
                        {shift.direction}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ManifestCard>

          <ManifestCard className="lg:col-span-5">
            <ManifestHeader
              title="Open Safety & SOS Alerts"
              description="Active incident beacons requiring immediate dispatcher acknowledgment"
            />
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !data?.openAlerts.length ? (
              <EmptyState
                title="Bridge telemetry clear"
                description="Zero open SOS or geofence alerts in the active tenant queue."
              />
            ) : (
              <div className="divide-y divide-border">
                {data.openAlerts.map((alert) => (
                  <div key={alert.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge tone={statusToneFor(alert.severity)} dot>
                        {alert.alertType} · {alert.severity}
                      </StatusBadge>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatLocalTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 font-medium text-foreground">
                      {alert.title ?? "Safety event triggered"}
                    </p>
                    {alert.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ManifestCard>
        </div>

        {/* Bottom Ledger: Recent Trips */}
        <ManifestCard>
          <ManifestHeader
            title="Recent Trip Manifests"
            description="Latest published and active trips across Hyderabad pickup corridors"
            actions={
              <Link
                href="/trips"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All trips
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data?.recentTrips.length ? (
            <EmptyState
              title="No trips published yet"
              description="Approve bookings in the Approval Queue and allocate cabs in the Dispatch Workbench."
              action={
                <Link
                  href="/dispatch"
                  className={buttonVariants({ size: "sm" })}
                >
                  Create manual dispatch
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#F8FAFC]">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Trip Code
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Schedule & Shift
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Driver & Vehicle
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Load
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentTrips.map((trip) => (
                    <tr
                      key={trip.id}
                      className="transition-colors duration-150 hover:bg-[#F7FAFF]"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold tabular-nums">
                        <Link
                          href={`/trips/${trip.id}`}
                          className="text-primary hover:underline"
                        >
                          {trip.tripCode}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-foreground tabular-nums">
                            {trip.travelDate}
                          </span>
                          <StatusBadge tone={statusToneFor(trip.direction)}>
                            {trip.direction}
                          </StatusBadge>
                          <span className="text-xs text-muted-foreground">
                            {trip.shiftName} ({trip.shiftTimeLocal})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-xs font-medium text-foreground">
                          {trip.driverName ?? "Unassigned driver"}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {trip.vehicleRegistrationNo ?? "No cab assigned"}
                          {trip.vehicleModelName ? ` · ${trip.vehicleModelName}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                        {trip.passengerCount}
                        {trip.seatingCapacity ? ` / ${trip.seatingCapacity} seats` : " pax"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={statusToneFor(trip.status)} dot>
                          {trip.status}
                        </StatusBadge>
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

