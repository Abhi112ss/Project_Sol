"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, MapPin, Plus, Truck } from "lucide-react";
import { apiRequest, formatInrFromPaise } from "@/lib/api";
import type {
  OfficeItem,
  ShiftItem,
  TripDirection,
  VendorItem,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type RegistryTab = "vendors" | "offices" | "shifts";

export function VendorsView() {
  const queryClient = useQueryClient();
  const { identity, canWriteOperations, canEditOrgSettings } = useDevSession();
  const { pushToast } = useToast();

  const [tab, setTab] = useState<RegistryTab>("vendors");
  const [drawerMode, setDrawerMode] = useState<RegistryTab | null>(null);

  const [vendorForm, setVendorForm] = useState({
    name: "",
    code: "",
    contactName: "",
    contactPhone: "+91",
    billingBaseTripPaise: "45000",
    billingRatePerKmPaise: "1800",
  });

  const [officeForm, setOfficeForm] = useState({
    name: "",
    code: "",
    address: "",
    latitude: "17.4435",
    longitude: "78.3772",
    geofenceRadiusM: "250",
  });

  const [shiftForm, setShiftForm] = useState({
    officeId: "",
    name: "",
    code: "",
    direction: "LOGIN" as TripDirection,
    shiftTimeLocal: "09:30",
    daysOfWeek: "MON,TUE,WED,THU,FRI",
  });

  const { data: vendors = [], error: vendorsErr, refetch: refetchVendors } = useQuery({
    queryKey: ["vendors", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<VendorItem[]>("/admin/vendors", identity),
  });

  const { data: offices = [], error: officesErr, refetch: refetchOffices } = useQuery({
    queryKey: ["offices", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OfficeItem[]>("/admin/offices", identity),
  });

  const { data: shifts = [], error: shiftsErr, refetch: refetchShifts } = useQuery({
    queryKey: ["shifts", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<ShiftItem[]>("/admin/shifts", identity),
  });

  const createVendorMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("/admin/vendors", identity, {
        method: "POST",
        body,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Vendor created" });
      setDrawerMode(null);
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Vendor creation failed",
        description: err.message,
      });
    },
  });

  const toggleVendorMutation = useMutation({
    mutationFn: ({ vendorId, isActive }: { vendorId: string; isActive: boolean }) =>
      apiRequest(`/admin/vendors/${vendorId}`, identity, {
        method: "PATCH",
        body: { isActive },
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Vendor status updated" });
      void queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  const createOfficeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("/admin/offices", identity, {
        method: "POST",
        body,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Campus office added" });
      setDrawerMode(null);
      void queryClient.invalidateQueries({ queryKey: ["offices"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Office creation failed",
        description: err.message,
      });
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("/admin/shifts", identity, {
        method: "POST",
        body,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Shift definition created" });
      setDrawerMode(null);
      void queryClient.invalidateQueries({ queryKey: ["shifts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Shift creation failed",
        description: err.message,
      });
    },
  });

  const toggleShiftMutation = useMutation({
    mutationFn: ({ shiftId, isActive }: { shiftId: string; isActive: boolean }) =>
      apiRequest(`/admin/shifts/${shiftId}`, identity, {
        method: "PATCH",
        body: { isActive },
      }),
    onSuccess: () => {
      pushToast({ tone: "success", title: "Shift status updated" });
      void queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  const activeError = vendorsErr || officesErr || shiftsErr;

  return (
    <AdminShell
      title="Vendors, Offices & Shifts"
      subtitle="Configure Hyderabad fleet partners, INR rate cards, corporate campus geofences, and 24/7 shift windows"
      headerActions={
        <div className="flex items-center gap-2">
          {tab === "vendors" && canWriteOperations && (
            <Button
              type="button"
              size="sm"
              onClick={() => setDrawerMode("vendors")}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add Vendor
            </Button>
          )}
          {tab === "offices" && canEditOrgSettings && (
            <Button
              type="button"
              size="sm"
              onClick={() => setDrawerMode("offices")}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add Campus Office
            </Button>
          )}
          {tab === "shifts" && canWriteOperations && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!shiftForm.officeId && offices[0]) {
                  setShiftForm((p) => ({ ...p, officeId: offices[0].id }));
                }
                setDrawerMode("shifts");
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add Shift
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {activeError && (
          <QueryErrorBanner
            message={activeError.message}
            onRetry={() => {
              void refetchVendors();
              void refetchOffices();
              void refetchShifts();
            }}
          />
        )}

        {/* Segmented Tabs */}
        <div
          role="tablist"
          aria-label="Master data categories"
          className="inline-flex rounded-lg border border-border bg-card p-1 gap-1"
        >
          {(
            [
              { id: "vendors", label: `Fleet Vendors (${vendors.length})`, icon: Truck },
              { id: "offices", label: `Campus Offices (${offices.length})`, icon: Building2 },
              { id: "shifts", label: `Shift Windows (${shifts.length})`, icon: Clock },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,color] duration-150",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Vendors Tab */}
        {tab === "vendors" && (
          <ManifestCard>
            <ManifestHeader
              title="Fleet Vendor Partners & Tariff Cards"
              description="Approved cab operators servicing Acme Tech Park shifts"
            />
            <div className="divide-y divide-border">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold rounded border border-border bg-secondary px-1.5 py-0.5 tabular-nums">
                        {vendor.code}
                      </span>
                      <span className="font-semibold text-foreground">
                        {vendor.name}
                      </span>
                      <StatusBadge
                        tone={vendor.isActive ? "emerald" : "slate"}
                        dot
                      >
                        {vendor.isActive ? "ACTIVE" : "INACTIVE"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-mono tabular-nums">
                      Contact: {vendor.contactName} ({vendor.contactPhone})
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono text-xs tabular-nums">
                      <p className="font-semibold text-foreground">
                        {formatInrFromPaise(vendor.billingBaseTripPaise)} / base trip
                      </p>
                      <p className="text-muted-foreground">
                        + {formatInrFromPaise(vendor.billingRatePerKmPaise)} / km
                      </p>
                    </div>
                    {canWriteOperations && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          toggleVendorMutation.mutate({
                            vendorId: vendor.id,
                            isActive: !vendor.isActive,
                          })
                        }
                      >
                        {vendor.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ManifestCard>
        )}

        {/* Campus Offices Tab */}
        {tab === "offices" && (
          <ManifestCard>
            <ManifestHeader
              title="Corporate Campus Offices & Geofences"
              description="Authoritative PostGIS terminus coordinates for LOGIN drops and LOGOUT departures"
            />
            <div className="divide-y divide-border">
              {offices.map((office) => (
                <div
                  key={office.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold rounded border border-border bg-secondary px-1.5 py-0.5 tabular-nums">
                        {office.code}
                      </span>
                      <span className="font-semibold text-foreground">
                        {office.name}
                      </span>
                      <StatusBadge
                        tone={office.isActive ? "emerald" : "slate"}
                        dot
                      >
                        {office.isActive ? "ACTIVE" : "INACTIVE"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {office.address}
                    </p>
                  </div>

                  <div className="font-mono text-xs text-right text-muted-foreground tabular-nums">
                    <p className="flex items-center gap-1 justify-end text-foreground">
                      <MapPin className="size-3 text-primary" aria-hidden="true" />
                      {office.latitude.toFixed(4)}, {office.longitude.toFixed(4)}
                    </p>
                    <p>{office.geofenceRadiusM}m arrival geofence</p>
                  </div>
                </div>
              ))}
            </div>
          </ManifestCard>
        )}

        {/* Shifts Tab */}
        {tab === "shifts" && (
          <ManifestCard>
            <ManifestHeader
              title="Login & Logout Shift Catalog"
              description="Shifts governing approval queues and route grouping rules"
            />
            <div className="divide-y divide-border">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold rounded border border-border bg-secondary px-1.5 py-0.5 tabular-nums">
                        {shift.code}
                      </span>
                      <span className="font-semibold text-foreground">
                        {shift.name}
                      </span>
                      <StatusBadge tone={statusToneFor(shift.direction)}>
                        {shift.direction}
                      </StatusBadge>
                      <StatusBadge
                        tone={shift.isActive ? "emerald" : "slate"}
                        dot
                      >
                        {shift.isActive ? "ACTIVE" : "PAUSED"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                      {shift.shiftTimeLocal} IST · {shift.daysOfWeek}
                    </p>
                  </div>

                  {canWriteOperations && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        toggleShiftMutation.mutate({
                          shiftId: shift.id,
                          isActive: !shift.isActive,
                        })
                      }
                    >
                      {shift.isActive ? "Pause Shift" : "Resume Shift"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ManifestCard>
        )}
      </div>

      {/* Create Drawer */}
      <SlideOverDrawer
        open={drawerMode !== null}
        onClose={() => setDrawerMode(null)}
        title={
          drawerMode === "vendors"
            ? "Add Fleet Vendor"
            : drawerMode === "offices"
              ? "Add Campus Office"
              : "Add Shift Definition"
        }
      >
        {drawerMode === "vendors" && (
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              createVendorMutation.mutate({
                name: vendorForm.name,
                code: vendorForm.code.toUpperCase(),
                contactName: vendorForm.contactName,
                contactPhone: vendorForm.contactPhone,
                billingBaseTripPaise: Number(vendorForm.billingBaseTripPaise),
                billingRatePerKmPaise: Number(vendorForm.billingRatePerKmPaise),
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="v-name" required>
                  Vendor Name
                </FieldLabel>
                <Input
                  id="v-name"
                  required
                  value={vendorForm.name}
                  onChange={(e) =>
                    setVendorForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="v-code" required>
                  Vendor Code
                </FieldLabel>
                <Input
                  id="v-code"
                  required
                  placeholder="VEND-HYD-02"
                  value={vendorForm.code}
                  onChange={(e) =>
                    setVendorForm((p) => ({ ...p, code: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="v-cname" required>
                  Contact Name
                </FieldLabel>
                <Input
                  id="v-cname"
                  required
                  value={vendorForm.contactName}
                  onChange={(e) =>
                    setVendorForm((p) => ({ ...p, contactName: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="v-cphone" required>
                  Contact Phone
                </FieldLabel>
                <Input
                  id="v-cphone"
                  required
                  value={vendorForm.contactPhone}
                  onChange={(e) =>
                    setVendorForm((p) => ({
                      ...p,
                      contactPhone: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="v-base" required>
                  Base Trip (Paise)
                </FieldLabel>
                <Input
                  id="v-base"
                  type="number"
                  required
                  value={vendorForm.billingBaseTripPaise}
                  onChange={(e) =>
                    setVendorForm((p) => ({
                      ...p,
                      billingBaseTripPaise: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="v-km" required>
                  Per KM (Paise)
                </FieldLabel>
                <Input
                  id="v-km"
                  type="number"
                  required
                  value={vendorForm.billingRatePerKmPaise}
                  onChange={(e) =>
                    setVendorForm((p) => ({
                      ...p,
                      billingRatePerKmPaise: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerMode(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createVendorMutation.isPending}>
                Create Vendor
              </Button>
            </div>
          </form>
        )}

        {drawerMode === "offices" && (
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              createOfficeMutation.mutate({
                name: officeForm.name,
                code: officeForm.code.toUpperCase(),
                address: officeForm.address,
                latitude: Number(officeForm.latitude),
                longitude: Number(officeForm.longitude),
                geofenceRadiusM: Number(officeForm.geofenceRadiusM),
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="o-name" required>
                  Campus Name
                </FieldLabel>
                <Input
                  id="o-name"
                  required
                  value={officeForm.name}
                  onChange={(e) =>
                    setOfficeForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="o-code" required>
                  Campus Code
                </FieldLabel>
                <Input
                  id="o-code"
                  required
                  placeholder="HYD-WAV"
                  value={officeForm.code}
                  onChange={(e) =>
                    setOfficeForm((p) => ({ ...p, code: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="o-addr" required>
                Street Address
              </FieldLabel>
              <Input
                id="o-addr"
                required
                value={officeForm.address}
                onChange={(e) =>
                  setOfficeForm((p) => ({ ...p, address: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <FieldLabel htmlFor="o-lat" required>
                  Latitude
                </FieldLabel>
                <Input
                  id="o-lat"
                  type="number"
                  step="0.0001"
                  required
                  value={officeForm.latitude}
                  onChange={(e) =>
                    setOfficeForm((p) => ({ ...p, latitude: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="o-lng" required>
                  Longitude
                </FieldLabel>
                <Input
                  id="o-lng"
                  type="number"
                  step="0.0001"
                  required
                  value={officeForm.longitude}
                  onChange={(e) =>
                    setOfficeForm((p) => ({ ...p, longitude: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="o-rad" required>
                  Geofence (m)
                </FieldLabel>
                <Input
                  id="o-rad"
                  type="number"
                  min={50}
                  max={2000}
                  required
                  value={officeForm.geofenceRadiusM}
                  onChange={(e) =>
                    setOfficeForm((p) => ({
                      ...p,
                      geofenceRadiusM: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerMode(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createOfficeMutation.isPending}>
                Create Office
              </Button>
            </div>
          </form>
        )}

        {drawerMode === "shifts" && (
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              createShiftMutation.mutate({
                officeId: shiftForm.officeId || offices[0]?.id,
                name: shiftForm.name,
                code: shiftForm.code.toUpperCase(),
                direction: shiftForm.direction,
                shiftTimeLocal: shiftForm.shiftTimeLocal,
                daysOfWeek: shiftForm.daysOfWeek,
              });
            }}
          >
            <div>
              <FieldLabel htmlFor="s-office" required>
                Campus Office
              </FieldLabel>
              <Select
                id="s-office"
                value={shiftForm.officeId}
                onChange={(e) =>
                  setShiftForm((p) => ({ ...p, officeId: e.target.value }))
                }
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="s-name" required>
                  Shift Name
                </FieldLabel>
                <Input
                  id="s-name"
                  required
                  placeholder="Night Login Shift"
                  value={shiftForm.name}
                  onChange={(e) =>
                    setShiftForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="s-code" required>
                  Code
                </FieldLabel>
                <Input
                  id="s-code"
                  required
                  placeholder="S3"
                  value={shiftForm.code}
                  onChange={(e) =>
                    setShiftForm((p) => ({ ...p, code: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel htmlFor="s-dir" required>
                  Direction
                </FieldLabel>
                <Select
                  id="s-dir"
                  value={shiftForm.direction}
                  onChange={(e) =>
                    setShiftForm((p) => ({
                      ...p,
                      direction: e.target.value as TripDirection,
                    }))
                  }
                >
                  <option value="LOGIN">LOGIN</option>
                  <option value="LOGOUT">LOGOUT</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="s-time" required>
                  Shift Time (HH:MM)
                </FieldLabel>
                <Input
                  id="s-time"
                  required
                  pattern="^([01]\d|2[0-3]):[0-5]\d$"
                  placeholder="22:00"
                  value={shiftForm.shiftTimeLocal}
                  onChange={(e) =>
                    setShiftForm((p) => ({
                      ...p,
                      shiftTimeLocal: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="s-days">Active Days</FieldLabel>
              <Input
                id="s-days"
                value={shiftForm.daysOfWeek}
                onChange={(e) =>
                  setShiftForm((p) => ({ ...p, daysOfWeek: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerMode(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createShiftMutation.isPending}>
                Create Shift
              </Button>
            </div>
          </form>
        )}
      </SlideOverDrawer>
    </AdminShell>
  );
}

