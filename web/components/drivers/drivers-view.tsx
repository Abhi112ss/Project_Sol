"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { Calendar, MapPin, Plus, ShieldBan, ShieldCheck } from "lucide-react";
import { apiRequest, formatLocalTime } from "@/lib/api";
import type {
  CanonicalLocalityItem,
  DriverAvailabilityStatus,
  DriverItem,
  TripSummaryItem,
  VehicleItem,
  VendorItem,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";

export function DriversView() {
  const queryClient = useQueryClient();
  const { identity, canWriteOperations } = useDevSession();
  const { pushToast } = useToast();

  const canManageDrivers =
    canWriteOperations || identity.role === "VENDOR_SUPERVISOR";

  const [addOpen, setAddOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverItem | null>(null);

  const [newDriver, setNewDriver] = useState({
    fullName: "",
    email: "",
    phone: "+91",
    vendorId: "",
    assignedVehicleId: "",
    baseLocalityId: "",
    driverCode: "",
    licenseNo: "",
    licenseExpiresAt: "",
  });

  const [editAvail, setEditAvail] =
    useState<DriverAvailabilityStatus>("AVAILABLE");
  const [editVehicleId, setEditVehicleId] = useState("");
  const [editLocalityId, setEditLocalityId] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const {
    data: drivers = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["drivers", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<DriverItem[]>("/admin/drivers", identity),
  });

  const { data: localities = [] } = useQuery({
    queryKey: ["localities", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<CanonicalLocalityItem[]>("/admin/localities", identity),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VendorItem[]>("/admin/vendors", identity),
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VehicleItem[]>("/admin/vehicles", identity),
  });

  const { data: schedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: [
      "driver-schedule",
      identity.orgId,
      identity.userId,
      selectedDriver?.id,
    ],
    queryFn: () =>
      apiRequest<TripSummaryItem[]>(
        `/admin/drivers/${selectedDriver?.id}/schedule`,
        identity,
      ),
    enabled: Boolean(selectedDriver?.id),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("/admin/drivers", identity, {
        method: "POST",
        body: payload,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Driver registered in fleet" });
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Failed to register driver",
        description: err.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      driverId,
      body,
    }: {
      driverId: string;
      body: Record<string, unknown>;
    }) =>
      apiRequest(`/admin/drivers/${driverId}`, identity, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Driver assignment updated" });
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setSelectedDriver(null);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({
      driverId,
      suspend,
      reason,
    }: {
      driverId: string;
      suspend: boolean;
      reason: string;
    }) =>
      apiRequest(`/admin/drivers/${driverId}/suspend`, identity, {
        method: "POST",
        body: { suspend, reason },
        idempotent: true,
      }),
    onSuccess: (_, vars) => {
      pushToast({
        tone: "info",
        title: vars.suspend ? "Driver suspended" : "Driver reactivated",
      });
      setSuspendReason("");
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setSelectedDriver(null);
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Action failed",
        description: err.message,
      });
    },
  });

  const columns = useMemo<LegacyColumnDef<DriverItem, unknown>[]>(
    () => [
      {
        id: "code",
        header: "Driver Code",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold tabular-nums">
            {row.original.driverCode}
          </span>
        ),
      },
      {
        id: "name",
        header: "Chauffeur",
        cell: ({ row }) => {
          const drv = row.original;
          return (
            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDriver(drv);
                  setEditAvail(drv.availabilityStatus);
                  setEditVehicleId(drv.assignedVehicleId ?? "");
                  setEditLocalityId(drv.baseLocalityId ?? "");
                  setSuspendReason("");
                }}
                className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {drv.fullName}
              </button>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {drv.phone}
              </p>
            </div>
          );
        },
      },
      {
        id: "vendor",
        header: "Vendor & Paired Cab",
        cell: ({ row }) => (
          <div>
            <p className="text-xs font-medium text-foreground">
              {row.original.vendorName}
            </p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.vehicleRegistrationNo ?? "Unpaired"}
            </p>
          </div>
        ),
      },
      {
        id: "license",
        header: "Base Locality & License",
        cell: ({ row }) => (
          <div>
            <p className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
              <MapPin className="size-3 text-primary" aria-hidden="true" />
              {row.original.baseLocalityName ?? "Unassigned zone"}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {row.original.licenseNo}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const drv = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <StatusBadge tone={statusToneFor(drv.availabilityStatus)} dot>
                {drv.availabilityStatus}
              </StatusBadge>
              {drv.isSuspended && (
                <StatusBadge tone="crimson">SUSPENDED</StatusBadge>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const submitNewDriver = (event: React.FormEvent) => {
    event.preventDefault();
    const vendorId = newDriver.vendorId || vendors[0]?.id;
    if (!vendorId) return;
    createMutation.mutate({
      fullName: newDriver.fullName,
      email: newDriver.email,
      phone: newDriver.phone,
      vendorId,
      assignedVehicleId: newDriver.assignedVehicleId || undefined,
      baseLocalityId: newDriver.baseLocalityId || undefined,
      driverCode: newDriver.driverCode,
      licenseNo: newDriver.licenseNo,
      licenseExpiresAt: newDriver.licenseExpiresAt
        ? new Date(`${newDriver.licenseExpiresAt}T23:59:59+05:30`).toISOString()
        : undefined,
    });
  };

  return (
    <AdminShell
      title="Chauffeurs & Fleet Drivers"
      subtitle="Monitor license compliance, vehicle pairings, duty availability, and trip schedules"
      headerActions={
        canManageDrivers ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!newDriver.vendorId && vendors[0]) {
                setNewDriver((p) => ({ ...p, vendorId: vendors[0].id }));
              }
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Register Driver
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {error && (
          <QueryErrorBanner
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        <ManifestCard>
          <ManifestHeader
            title="Active Driver Roster"
            description={`${drivers.length} driver(s) — click any driver to view trip schedule or suspend/reactivate`}
          />
          <DataLedger
            data={drivers}
            columns={columns}
            isLoading={isLoading}
            onRowClick={(drv) => {
              setSelectedDriver(drv);
              setEditAvail(drv.availabilityStatus);
              setEditVehicleId(drv.assignedVehicleId ?? "");
              setEditLocalityId(drv.baseLocalityId ?? "");
              setSuspendReason("");
            }}
          />
        </ManifestCard>
      </div>

      {/* Driver Inspector & Schedule Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedDriver)}
        onClose={() => setSelectedDriver(null)}
        title={selectedDriver?.fullName ?? "Driver Inspector"}
        subtitle={
          selectedDriver
            ? `${selectedDriver.driverCode} · ${selectedDriver.vendorName}`
            : undefined
        }
        width="lg"
      >
        {selectedDriver && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Duty Availability & Vehicle Pairing
                </span>
                {selectedDriver.isSuspended && (
                  <StatusBadge tone="crimson" dot>
                    SUSPENDED
                  </StatusBadge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="drv-avail">Availability Status</FieldLabel>
                  <Select
                    id="drv-avail"
                    value={editAvail}
                    disabled={!canManageDrivers}
                    onChange={(e) =>
                      setEditAvail(e.target.value as DriverAvailabilityStatus)
                    }
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="OFF_DUTY">OFF_DUTY</option>
                    <option value="ON_TRIP">ON_TRIP</option>
                  </Select>
                </div>

                <div>
                  <FieldLabel htmlFor="drv-veh">Paired Cab</FieldLabel>
                  <Select
                    id="drv-veh"
                    value={editVehicleId}
                    disabled={!canManageDrivers}
                    onChange={(e) => setEditVehicleId(e.target.value)}
                  >
                    <option value="">No paired cab</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registrationNo} · {v.modelName}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="drv-base-loc">
                    Protected Operational Base Locality
                  </FieldLabel>
                  <Select
                    id="drv-base-loc"
                    value={editLocalityId}
                    disabled={!canManageDrivers}
                    onChange={(e) => setEditLocalityId(e.target.value)}
                  >
                    <option value="">Unassigned zone</option>
                    {localities.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.canonicalName} (radius {(loc.proximityRadiusM / 1000).toFixed(1)} km)
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {canManageDrivers && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="xs"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        driverId: selectedDriver.id,
                        body: {
                          availabilityStatus: editAvail,
                          assignedVehicleId: editVehicleId || null,
                          baseLocalityId: editLocalityId || null,
                        },
                      })
                    }
                  >
                    Save Availability, Cab & Locality
                  </Button>
                </div>
              )}
            </div>

            {canWriteOperations && (
              <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2]/50 p-3.5 space-y-2.5">
                <p className="text-xs font-semibold text-[#9F1239]">
                  {selectedDriver.isSuspended
                    ? "Reactivate Suspended Chauffeur"
                    : "Suspend Chauffeur Dispatch Privileges"}
                </p>
                <FieldLabel htmlFor="drv-suspend-reason" required>
                  Audit reason
                </FieldLabel>
                <Input
                  id="drv-suspend-reason"
                  name="suspendReason"
                  placeholder="Mandatory audit log reason (min 3 chars)..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                />
                <Button
                  type="button"
                  size="xs"
                  variant={selectedDriver.isSuspended ? "outline" : "destructive"}
                  disabled={
                    suspendReason.trim().length < 3 || suspendMutation.isPending
                  }
                  onClick={() =>
                    suspendMutation.mutate({
                      driverId: selectedDriver.id,
                      suspend: !selectedDriver.isSuspended,
                      reason: suspendReason.trim(),
                    })
                  }
                >
                  {selectedDriver.isSuspended ? (
                    <>
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      Reactivate Driver
                    </>
                  ) : (
                    <>
                      <ShieldBan className="size-3.5" aria-hidden="true" />
                      Suspend Driver
                    </>
                  )}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                Scheduled & Historical Trips ({schedule.length})
              </h3>
              {scheduleLoading ? (
                <p className="text-xs text-muted-foreground">Loading trips...</p>
              ) : schedule.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No trips currently assigned to this chauffeur.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {schedule.map((trip) => (
                    <Link
                      key={trip.id}
                      href={`/trips/${trip.id}`}
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#F7FAFF]"
                    >
                      <div>
                        <span className="font-mono font-semibold text-primary tabular-nums">
                          {trip.tripCode}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {trip.travelDate} · {trip.direction}
                        </span>
                        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          Start {formatLocalTime(trip.plannedStartAt)}
                        </p>
                      </div>
                      <StatusBadge tone={statusToneFor(trip.status)} dot>
                        {trip.status}
                      </StatusBadge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Register Driver Drawer */}
      <SlideOverDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register Fleet Driver"
        subtitle="Onboard a vendor chauffeur and optionally pair with a registered vehicle"
      >
        <form id="add-drv-form" onSubmit={submitNewDriver} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nd-name" required>
                Full Name
              </FieldLabel>
              <Input
                id="nd-name"
                required
                value={newDriver.fullName}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, fullName: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="nd-code" required>
                Driver Code
              </FieldLabel>
              <Input
                id="nd-code"
                required
                placeholder="DRV-DECCAN-03"
                value={newDriver.driverCode}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, driverCode: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nd-email" required>
                Email
              </FieldLabel>
              <Input
                id="nd-email"
                type="email"
                required
                value={newDriver.email}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="nd-phone" required>
                Phone
              </FieldLabel>
              <Input
                id="nd-phone"
                required
                value={newDriver.phone}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nd-vendor" required>
                Fleet Vendor
              </FieldLabel>
              <Select
                id="nd-vendor"
                value={newDriver.vendorId}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, vendorId: e.target.value }))
                }
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="nd-veh">Pair Vehicle</FieldLabel>
              <Select
                id="nd-veh"
                value={newDriver.assignedVehicleId}
                onChange={(e) =>
                  setNewDriver((p) => ({
                    ...p,
                    assignedVehicleId: e.target.value,
                  }))
                }
              >
                <option value="">Pair later</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNo} ({v.modelName})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nd-lic" required>
                Driving License No
              </FieldLabel>
              <Input
                id="nd-lic"
                required
                placeholder="TS09 20210045612"
                value={newDriver.licenseNo}
                onChange={(e) =>
                  setNewDriver((p) => ({ ...p, licenseNo: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="nd-exp">License Expiry</FieldLabel>
              <Input
                id="nd-exp"
                type="date"
                value={newDriver.licenseExpiresAt}
                onChange={(e) =>
                  setNewDriver((p) => ({
                    ...p,
                    licenseExpiresAt: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="nd-loc">Operational Base Locality</FieldLabel>
            <Select
              id="nd-loc"
              value={newDriver.baseLocalityId}
              onChange={(e) =>
                setNewDriver((p) => ({
                  ...p,
                  baseLocalityId: e.target.value,
                }))
              }
            >
              <option value="">Unassigned zone</option>
              {localities.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.canonicalName}
                </option>
              ))}
            </Select>
          </div>
        </form>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-drv-form"
            disabled={createMutation.isPending}
          >
            Register Driver
          </Button>
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}

