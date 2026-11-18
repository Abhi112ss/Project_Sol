"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { Link2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/api";
import type {
  DriverItem,
  VehicleAvailabilityStatus,
  VehicleItem,
  VehicleType,
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

function maxSeatsForVehicleType(type: VehicleType): number {
  switch (type) {
    case "SEDAN":
    case "EV_SEDAN":
      return 4;
    case "SUV":
      return 6;
    case "TEMPO_TRAVELLER":
      return 12;
    case "SHUTTLE_BUS":
      return 45;
  }
}

export function VehiclesView() {
  const queryClient = useQueryClient();
  const { identity, canWriteOperations } = useDevSession();
  const { pushToast } = useToast();

  const canManageVehicles =
    canWriteOperations || identity.role === "VENDOR_SUPERVISOR";

  const [addOpen, setAddOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(
    null,
  );

  const [newVeh, setNewVeh] = useState({
    vendorId: "",
    registrationNo: "",
    modelName: "",
    vehicleType: "SEDAN" as VehicleType,
    seatingCapacity: "4",
    insuranceExpiresAt: "",
  });

  const [editStatus, setEditStatus] =
    useState<VehicleAvailabilityStatus>("AVAILABLE");
  const [editSeats, setEditSeats] = useState("4");
  const [pairDriverId, setPairDriverId] = useState("");

  const {
    data: vehicles = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["vehicles", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VehicleItem[]>("/admin/vehicles", identity),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VendorItem[]>("/admin/vendors", identity),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<DriverItem[]>("/admin/drivers", identity),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("/admin/vehicles", identity, {
        method: "POST",
        body: payload,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Vehicle registered in fleet" });
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Vehicle registration error",
        description: err.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      vehicleId,
      body,
    }: {
      vehicleId: string;
      body: Record<string, unknown>;
    }) =>
      apiRequest(`/admin/vehicles/${vehicleId}`, identity, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Vehicle record updated" });
      setSelectedVehicle(null);
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: ({
      vehicleId,
      driverId,
    }: {
      vehicleId: string;
      driverId: string;
    }) =>
      apiRequest(`/admin/vehicles/${vehicleId}/assign-driver`, identity, {
        method: "POST",
        body: { driverId },
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Chauffeur paired with vehicle" });
      setPairDriverId("");
      setSelectedVehicle(null);
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Driver pairing failed",
        description: err.message,
      });
    },
  });

  const columns = useMemo<LegacyColumnDef<VehicleItem, unknown>[]>(
    () => [
      {
        id: "plate",
        header: "Registration No",
        cell: ({ row }) => {
          const veh = row.original;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedVehicle(veh);
                setEditStatus(veh.availabilityStatus);
                setEditSeats(String(veh.seatingCapacity));
                setPairDriverId("");
              }}
              className="font-mono text-xs font-semibold text-primary hover:underline tabular-nums focus-visible:outline-none focus-visible:underline"
            >
              {veh.registrationNo}
            </button>
          );
        },
      },
      {
        id: "model",
        header: "Model & Class",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.modelName}</p>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {row.original.vehicleType} · {row.original.seatingCapacity} seats
            </p>
          </div>
        ),
      },
      {
        id: "vendor",
        header: "Vendor",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">
            {row.original.vendorName}
          </span>
        ),
      },
      {
        id: "compliance",
        header: "Insurance Expiry",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.insuranceExpiresAt
              ? row.original.insuranceExpiresAt.slice(0, 10)
              : "Not filed"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Availability",
        cell: ({ row }) => (
          <StatusBadge
            tone={statusToneFor(row.original.availabilityStatus)}
            dot
          >
            {row.original.availabilityStatus}
          </StatusBadge>
        ),
      },
    ],
    [],
  );

  const submitNewVehicle = (event: React.FormEvent) => {
    event.preventDefault();
    const vendorId = newVeh.vendorId || vendors[0]?.id;
    if (!vendorId) return;
    createMutation.mutate({
      vendorId,
      registrationNo: newVeh.registrationNo.toUpperCase(),
      modelName: newVeh.modelName,
      vehicleType: newVeh.vehicleType,
      seatingCapacity: Number(newVeh.seatingCapacity),
      insuranceExpiresAt: newVeh.insuranceExpiresAt
        ? new Date(`${newVeh.insuranceExpiresAt}T23:59:59+05:30`).toISOString()
        : undefined,
    });
  };

  return (
    <AdminShell
      title="Fleet Vehicles"
      subtitle="Manage seating capacity limits, compliance expiry dates, maintenance hold status, and driver pairings"
      headerActions={
        canManageVehicles ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!newVeh.vendorId && vendors[0]) {
                setNewVeh((p) => ({ ...p, vendorId: vendors[0].id }));
              }
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Register Vehicle
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
            title="Registered Fleet Manifest"
            description={`${vehicles.length} vehicle(s) — click any vehicle to edit capacity, status, or pair a chauffeur`}
          />
          <DataLedger
            data={vehicles}
            columns={columns}
            isLoading={isLoading}
            onRowClick={(veh) => {
              setSelectedVehicle(veh);
              setEditStatus(veh.availabilityStatus);
              setEditSeats(String(veh.seatingCapacity));
              setPairDriverId("");
            }}
          />
        </ManifestCard>
      </div>

      {/* Vehicle Inspector Slide-Over */}
      <SlideOverDrawer
        open={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        title={selectedVehicle?.registrationNo ?? "Vehicle Details"}
        subtitle={
          selectedVehicle
            ? `${selectedVehicle.modelName} · ${selectedVehicle.vendorName}`
            : undefined
        }
      >
        {selectedVehicle && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3.5 space-y-3">
              <p className="text-xs font-semibold text-foreground">
                Capacity & Availability Controls
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="veh-status">Status</FieldLabel>
                  <Select
                    id="veh-status"
                    value={editStatus}
                    disabled={!canManageVehicles}
                    onChange={(e) =>
                      setEditStatus(e.target.value as VehicleAvailabilityStatus)
                    }
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="ON_TRIP">ON_TRIP</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="veh-seats">
                    Passenger Capacity (excl. driver, max{" "}
                    {maxSeatsForVehicleType(selectedVehicle.vehicleType)})
                  </FieldLabel>
                  <Input
                    id="veh-seats"
                    type="number"
                    min={1}
                    max={maxSeatsForVehicleType(selectedVehicle.vehicleType)}
                    value={editSeats}
                    disabled={!canManageVehicles}
                    onChange={(e) => setEditSeats(e.target.value)}
                  />
                </div>
              </div>
              {canManageVehicles && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="xs"
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        vehicleId: selectedVehicle.id,
                        body: {
                          availabilityStatus: editStatus,
                          seatingCapacity: Number(editSeats),
                        },
                      })
                    }
                  >
                    Update Vehicle
                  </Button>
                </div>
              )}
            </div>

            {canManageVehicles && (
              <div className="rounded-lg border border-border p-3.5 space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Link2 className="size-3.5 text-primary" aria-hidden="true" />
                  Pair Active Driver to {selectedVehicle.registrationNo}
                </p>
                <FieldLabel htmlFor="veh-pair-driver">Chauffeur</FieldLabel>
                <Select
                  id="veh-pair-driver"
                  name="pairDriverId"
                  aria-label="Select driver to pair"
                  value={pairDriverId}
                  onChange={(e) => setPairDriverId(e.target.value)}
                >
                  <option value="">Choose chauffeur...</option>
                  {drivers
                    .filter((d) => !d.isSuspended)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.driverCode})
                      </option>
                    ))}
                </Select>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!pairDriverId || assignDriverMutation.isPending}
                  onClick={() =>
                    assignDriverMutation.mutate({
                      vehicleId: selectedVehicle.id,
                      driverId: pairDriverId,
                    })
                  }
                >
                  Assign Paired Chauffeur
                </Button>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>

      {/* Add Vehicle Drawer */}
      <SlideOverDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register Fleet Vehicle"
        subtitle="Creates a cab or shuttle record enforced during manual dispatch capacity checks"
      >
        <form id="add-veh-form" onSubmit={submitNewVehicle} className="space-y-3.5">
          <div>
            <FieldLabel htmlFor="nv-vendor" required>
              Fleet Vendor
            </FieldLabel>
            <Select
              id="nv-vendor"
              value={newVeh.vendorId}
              onChange={(e) =>
                setNewVeh((p) => ({ ...p, vendorId: e.target.value }))
              }
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nv-reg" required>
                Registration Plate
              </FieldLabel>
              <Input
                id="nv-reg"
                required
                placeholder="TS09UB9012"
                value={newVeh.registrationNo}
                onChange={(e) =>
                  setNewVeh((p) => ({ ...p, registrationNo: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="nv-model" required>
                Model Name
              </FieldLabel>
              <Input
                id="nv-model"
                required
                placeholder="Toyota Innova Crysta"
                value={newVeh.modelName}
                onChange={(e) =>
                  setNewVeh((p) => ({ ...p, modelName: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="nv-type" required>
                Vehicle Class
              </FieldLabel>
              <Select
                id="nv-type"
                value={newVeh.vehicleType}
                onChange={(e) => {
                  const nextType = e.target.value as VehicleType;
                  const defaultCap =
                    nextType === "SHUTTLE_BUS"
                      ? 24
                      : maxSeatsForVehicleType(nextType);
                  setNewVeh((p) => ({
                    ...p,
                    vehicleType: nextType,
                    seatingCapacity: String(defaultCap),
                  }));
                }}
              >
                <option value="SEDAN">SEDAN (4 seats)</option>
                <option value="EV_SEDAN">EV_SEDAN (4 seats)</option>
                <option value="SUV">SUV (6 seats)</option>
                <option value="TEMPO_TRAVELLER">TEMPO_TRAVELLER (12 seats)</option>
                <option value="SHUTTLE_BUS">SHUTTLE_BUS</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="nv-seats" required>
                Passenger Capacity (excl. driver)
              </FieldLabel>
              <Input
                id="nv-seats"
                type="number"
                min={1}
                max={maxSeatsForVehicleType(newVeh.vehicleType)}
                required
                value={newVeh.seatingCapacity}
                onChange={(e) =>
                  setNewVeh((p) => ({ ...p, seatingCapacity: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="nv-ins">Insurance Expiry</FieldLabel>
            <Input
              id="nv-ins"
              type="date"
              value={newVeh.insuranceExpiresAt}
              onChange={(e) =>
                setNewVeh((p) => ({ ...p, insuranceExpiresAt: e.target.value }))
              }
            />
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
            form="add-veh-form"
            disabled={createMutation.isPending}
          >
            Register Vehicle
          </Button>
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}

