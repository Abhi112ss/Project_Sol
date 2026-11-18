"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type { TripDirection, TripStatus, TripSummaryItem } from "@/lib/types";
import { useDevSession } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { QueryErrorBanner } from "@/components/ui/empty-state";

export function TripsView() {
  const router = useRouter();
  const { identity } = useDevSession();

  const [travelDate, setTravelDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | TripStatus>("");
  const [directionFilter, setDirectionFilter] = useState<"" | TripDirection>("");

  const {
    data: trips = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "trips-list",
      identity.orgId,
      identity.userId,
      identity.role,
      travelDate,
      statusFilter,
      directionFilter,
    ],
    queryFn: () =>
      apiRequest<TripSummaryItem[]>("/admin/trips", identity, {
        query: {
          travelDate: travelDate || undefined,
          status: statusFilter || undefined,
          direction: directionFilter || undefined,
        },
      }),
  });

  const columns = useMemo<LegacyColumnDef<TripSummaryItem, unknown>[]>(
    () => [
      {
        id: "tripCode",
        header: "Trip Code",
        cell: ({ row }) => (
          <Link
            href={`/trips/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline tabular-nums"
          >
            {row.original.tripCode}
            <ExternalLink className="size-3" aria-hidden="true" />
          </Link>
        ),
      },
      {
        id: "shift",
        header: "Schedule & Shift",
        cell: ({ row }) => {
          const trip = row.original;
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                  {trip.travelDate}
                </span>
                <StatusBadge tone={statusToneFor(trip.direction)}>
                  {trip.direction}
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                {trip.shiftName} ({trip.shiftTimeLocal}) · {trip.officeName}
              </p>
            </div>
          );
        },
      },
      {
        id: "driver",
        header: "Assigned Driver & Cab",
        cell: ({ row }) => {
          const trip = row.original;
          return (
            <div>
              <p className="text-xs font-medium text-foreground">
                {trip.driverName ?? "Unassigned"}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {trip.vehicleRegistrationNo ?? "No vehicle"}
                {trip.vehicleModelName ? ` · ${trip.vehicleModelName}` : ""}
              </p>
            </div>
          );
        },
      },
      {
        id: "load",
        header: "Passengers",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.passengerCount}
            {row.original.seatingCapacity
              ? ` / ${row.original.seatingCapacity} seats`
              : " pax"}
          </span>
        ),
      },
      {
        id: "plannedStart",
        header: "Planned Start",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground tabular-nums">
            {formatLocalTime(row.original.plannedStartAt)}
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
    ],
    [],
  );

  return (
    <AdminShell
      title="Trips & Dispatch History"
      subtitle="Audit active routes, stop progression, decomposed delay timing, and historical cab manifests"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
          <Link href="/dispatch" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" aria-hidden="true" />
            Manual Dispatch
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

        <ManifestCard className="p-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="trp-date">Travel Date</FieldLabel>
              <Input
                id="trp-date"
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="trp-status">Trip Status</FieldLabel>
              <Select
                id="trp-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "" | TripStatus)}
              >
                <option value="">All statuses</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="DRIVER_ACCEPTED">DRIVER_ACCEPTED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="ABORTED">ABORTED</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="trp-dir">Direction</FieldLabel>
              <Select
                id="trp-dir"
                value={directionFilter}
                onChange={(e) =>
                  setDirectionFilter(e.target.value as "" | TripDirection)
                }
              >
                <option value="">All directions</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
              </Select>
            </div>
          </div>
        </ManifestCard>

        <ManifestCard>
          <ManifestHeader
            title="Published Trips Ledger"
            description={`${trips.length} trip(s) — click any row to inspect stops, wait metrics, and modify dispatch`}
          />
          <DataLedger
            data={trips}
            columns={columns}
            isLoading={isLoading}
            onRowClick={(trip) => router.push(`/trips/${trip.id}`)}
            emptyTitle="No trips match these filters"
            emptyDescription="Publish a cab manifest from Dispatch Workbench or clear your date/status filter."
          />
        </ManifestCard>
      </div>
    </AdminShell>
  );
}

