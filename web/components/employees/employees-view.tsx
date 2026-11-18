"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import {
  FileSpreadsheet,
  MapPin,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import { apiRequest, apiRequestWithMeta, formatLocalTime } from "@/lib/api";
import type {
  EmployeeDetailData,
  EmployeeItem,
  OfficeItem,
  ShiftItem,
} from "@/lib/types";
import { useDevSession, useToast } from "@/components/providers";
import { AdminShell } from "@/components/layout/admin-shell";
import { ManifestCard, ManifestHeader } from "@/components/ui/card";
import { DataLedger } from "@/components/ui/data-ledger";
import { StatusBadge, statusToneFor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/input";
import { SlideOverDrawer } from "@/components/ui/drawer";
import { QueryErrorBanner } from "@/components/ui/empty-state";

const SAMPLE_HYD_CSV = [
  "email,phone,fullName,employeeCode,department,officeCode,shiftCode,locationName,address,corridorTag,latitude,longitude",
  "divya.menon@acmetech.in,+919848011220,Divya Menon,EMP-HYD-201,Platform Engineering,HYD-CYB,S1,Gachibowli Circle,DLF Cyber City Road Gachibowli Hyderabad,Gachibowli,17.4401,78.3489",
  "rohan.deshmukh@acmetech.in,+919848011221,Rohan Deshmukh,EMP-HYD-202,Data Ops,HYD-CYB,S1,Kondapur X Roads,Botanical Garden Road Kondapur Hyderabad,Kondapur,17.4608,78.3664",
].join("\n");

export function EmployeesView() {
  const queryClient = useQueryClient();
  const { identity, canWriteOperations } = useDevSession();
  const { pushToast } = useToast();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");

  // Add employee fields
  const [newEmp, setNewEmp] = useState({
    fullName: "",
    email: "",
    phone: "+91",
    employeeCode: "",
    department: "Engineering",
    officeId: "",
    defaultShiftId: "",
    locationName: "",
    address: "",
    corridorTag: "Madhapur",
    latitude: "17.4483",
    longitude: "78.3915",
  });

  // Add pickup location inside inspector drawer
  const [locForm, setLocForm] = useState({
    locationName: "",
    address: "",
    corridorTag: "",
    latitude: "17.4483",
    longitude: "78.3915",
  });

  // Edit profile state
  const [editEligible, setEditEligible] = useState<boolean | null>(null);
  const [editDept, setEditDept] = useState("");

  const {
    data: employeeResult,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "employees",
      identity.orgId,
      identity.userId,
      identity.role,
      page,
      search,
    ],
    queryFn: () =>
      apiRequestWithMeta<EmployeeItem[]>("/admin/employees", identity, {
        query: { page, limit: 20, search: search.trim() || undefined },
      }),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ["offices", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OfficeItem[]>("/admin/offices", identity),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<ShiftItem[]>("/admin/shifts", identity),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["employee-detail", identity.orgId, identity.userId, selectedEmpId],
    queryFn: () =>
      apiRequest<EmployeeDetailData>(`/admin/employees/${selectedEmpId}`, identity),
    enabled: Boolean(selectedEmpId),
  });

  const createEmployeeMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("/admin/employees", identity, {
        method: "POST",
        body: payload,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Employee onboarded",
        description: "Directory record & verified coordinate stop saved.",
      });
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Failed to add employee",
        description: err.message,
      });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: (csv: string) =>
      apiRequest<{ importedCount: number; skippedCount: number }>(
        "/admin/employees/import",
        identity,
        {
          method: "POST",
          body: { csvText: csv },
          idempotent: true,
        },
      ),
    onSuccess: (res) => {
      pushToast({
        tone: "success",
        title: `Imported ${res.importedCount} employee(s)`,
        description:
          res.skippedCount > 0
            ? `${res.skippedCount} duplicate or skipped row(s).`
            : "All CSV rows persisted with pickup stops.",
      });
      setCsvOpen(false);
      setCsvText("");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "CSV import rejected",
        description: err.message,
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({
      employeeId,
      body,
    }: {
      employeeId: string;
      body: Record<string, unknown>;
    }) =>
      apiRequest(`/admin/employees/${employeeId}`, identity, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Employee profile updated",
      });
      setEditEligible(null);
      setEditDept("");
      void queryClient.invalidateQueries({ queryKey: ["employee-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  const addLocationMutation = useMutation({
    mutationFn: ({
      employeeId,
      body,
    }: {
      employeeId: string;
      body: Record<string, unknown>;
    }) =>
      apiRequest(`/admin/employees/${employeeId}/locations`, identity, {
        method: "POST",
        body,
        idempotent: true,
      }),
    onSuccess: () => {
      pushToast({
        tone: "success",
        title: "Saved pickup location added",
      });
      setLocForm({
        locationName: "",
        address: "",
        corridorTag: "",
        latitude: "17.4483",
        longitude: "78.3915",
      });
      void queryClient.invalidateQueries({ queryKey: ["employee-detail"] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Location validation error",
        description: err.message,
      });
    },
  });

  const columns = useMemo<LegacyColumnDef<EmployeeItem, unknown>[]>(
    () => [
      {
        id: "employeeCode",
        header: "Code",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
            {row.original.employeeCode}
          </span>
        ),
      },
      {
        id: "name",
        header: "Employee",
        cell: ({ row }) => {
          const emp = row.original;
          return (
            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEmpId(emp.id);
                  setEditEligible(emp.transportEligible);
                  setEditDept(emp.department);
                }}
                className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {emp.fullName}
              </button>
              <p className="text-xs text-muted-foreground">{emp.email}</p>
            </div>
          );
        },
      },
      {
        id: "dept",
        header: "Department & Office",
        cell: ({ row }) => (
          <div>
            <p className="text-xs font-medium text-foreground">
              {row.original.department}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.officeName}
            </p>
          </div>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.phone}
          </span>
        ),
      },
      {
        id: "eligible",
        header: "Transport Access",
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.transportEligible ? "emerald" : "crimson"}
            dot
          >
            {row.original.transportEligible ? "ELIGIBLE" : "DISABLED"}
          </StatusBadge>
        ),
      },
    ],
    [],
  );

  const items = employeeResult?.data ?? [];
  const pagination = employeeResult?.pagination;

  const submitNewEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    const officeId = newEmp.officeId || offices[0]?.id;
    if (!officeId) return;
    createEmployeeMutation.mutate({
      fullName: newEmp.fullName,
      email: newEmp.email,
      phone: newEmp.phone,
      employeeCode: newEmp.employeeCode,
      department: newEmp.department,
      officeId,
      defaultShiftId: newEmp.defaultShiftId || undefined,
      transportEligible: true,
      pickupLocation: newEmp.locationName
        ? {
            locationName: newEmp.locationName,
            address: newEmp.address || `${newEmp.locationName}, Hyderabad`,
            corridorTag: newEmp.corridorTag || undefined,
            latitude: Number(newEmp.latitude),
            longitude: Number(newEmp.longitude),
            geofenceRadiusM: 150,
          }
        : undefined,
    });
  };

  return (
    <AdminShell
      title="Employees Directory"
      subtitle="Manage commuter eligibility, default shifts, verified pickup geofences, and CSV onboarding"
      headerActions={
        canWriteOperations ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCsvOpen(true)}
            >
              <FileSpreadsheet className="size-3.5" aria-hidden="true" />
              Import CSV
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!newEmp.officeId && offices[0]) {
                  setNewEmp((p) => ({ ...p, officeId: offices[0].id }));
                }
                setAddOpen(true);
              }}
            >
              <UserPlus className="size-3.5" aria-hidden="true" />
              Add Employee
            </Button>
          </div>
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

        <ManifestCard className="p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="employees-search"
                name="employeesSearch"
                aria-label="Search employees"
                placeholder="Search by name, code, email, or department..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {pagination && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
                <span>
                  {pagination.total} employee(s) · Page {pagination.page} of{" "}
                  {Math.max(1, pagination.totalPages)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </ManifestCard>

        <ManifestCard>
          <ManifestHeader
            title="Registered Commuters"
            description="Click any employee row to inspect saved pickup pins, eligibility, and trip history"
          />
          <DataLedger
            data={items}
            columns={columns}
            isLoading={isLoading}
            onRowClick={(emp) => {
              setSelectedEmpId(emp.id);
              setEditEligible(emp.transportEligible);
              setEditDept(emp.department);
            }}
            emptyTitle="No employees found"
            emptyDescription="Import a CSV roster or onboard an employee manually."
          />
        </ManifestCard>
      </div>

      {/* Employee Inspector Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedEmpId)}
        onClose={() => setSelectedEmpId(null)}
        title={detail?.fullName ?? "Employee Profile"}
        subtitle={
          detail
            ? `${detail.employeeCode} · ${detail.department} · ${detail.officeName}`
            : undefined
        }
        width="lg"
      >
        {detailLoading || !detail ? (
          <p className="text-xs text-muted-foreground">Loading employee profile...</p>
        ) : (
          <div className="space-y-6">
            {/* Eligibility & Profile Form */}
            <div className="rounded-lg border border-border bg-[#F8FAFC] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">
                  Transport Eligibility & Department
                </h3>
                <StatusBadge
                  tone={detail.transportEligible ? "emerald" : "crimson"}
                  dot
                >
                  {detail.transportEligible ? "ELIGIBLE" : "DISABLED"}
                </StatusBadge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="emp-edit-dept">Department</FieldLabel>
                  <Input
                    id="emp-edit-dept"
                    value={editDept || detail.department}
                    onChange={(e) => setEditDept(e.target.value)}
                    disabled={!canWriteOperations}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="emp-edit-elig">Transport Access</FieldLabel>
                  <Select
                    id="emp-edit-elig"
                    value={String(editEligible ?? detail.transportEligible)}
                    onChange={(e) => setEditEligible(e.target.value === "true")}
                    disabled={!canWriteOperations}
                  >
                    <option value="true">Eligible for cab transport</option>
                    <option value="false">Suspended / Disabled</option>
                  </Select>
                </div>
              </div>
              {canWriteOperations && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="xs"
                    disabled={updateEmployeeMutation.isPending}
                    onClick={() =>
                      updateEmployeeMutation.mutate({
                        employeeId: detail.id,
                        body: {
                          department: editDept || detail.department,
                          transportEligible:
                            editEligible ?? detail.transportEligible,
                        },
                      })
                    }
                  >
                    Save Profile Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Saved Pickup Locations */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-foreground">
                Saved Pickup Locations ({detail.locations.length})
              </h3>
              {detail.locations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No pickup coordinates recorded yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.locations.map((loc) => (
                    <li
                      key={loc.id}
                      className="rounded-lg border border-border p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          {loc.locationName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {loc.corridorTag && (
                            <StatusBadge tone="neutral">
                              {loc.corridorTag}
                            </StatusBadge>
                          )}
                          {loc.isDefault && (
                            <StatusBadge tone="cobalt">Default</StatusBadge>
                          )}
                        </div>
                      </div>
                      <p className="text-muted-foreground">{loc.address}</p>
                      <p className="font-mono text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden="true" />
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} ·{" "}
                        {loc.geofenceRadiusM}m geofence
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {canWriteOperations && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addLocationMutation.mutate({
                      employeeId: detail.id,
                      body: {
                        locationName: locForm.locationName,
                        address: locForm.address,
                        corridorTag: locForm.corridorTag || undefined,
                        latitude: Number(locForm.latitude),
                        longitude: Number(locForm.longitude),
                        geofenceRadiusM: 150,
                      },
                    });
                  }}
                  className="rounded-lg border border-dashed border-border p-3 space-y-2.5"
                >
                  <p className="text-xs font-semibold text-foreground">
                    Add Verified Pickup Location
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="loc-name" required>
                        Location name
                      </FieldLabel>
                      <Input
                        id="loc-name"
                        name="locationName"
                        required
                        placeholder="e.g. Gate 2"
                        value={locForm.locationName}
                        onChange={(e) =>
                          setLocForm((p) => ({ ...p, locationName: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="loc-corridor">Corridor</FieldLabel>
                      <Input
                        id="loc-corridor"
                        name="corridorTag"
                        placeholder="e.g. Gachibowli"
                        value={locForm.corridorTag}
                        onChange={(e) =>
                          setLocForm((p) => ({ ...p, corridorTag: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="loc-address" required>
                      Street address
                    </FieldLabel>
                    <Input
                      id="loc-address"
                      name="address"
                      required
                      placeholder="Street address & landmark"
                      value={locForm.address}
                      onChange={(e) =>
                        setLocForm((p) => ({ ...p, address: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel htmlFor="loc-lat" required>
                        Latitude
                      </FieldLabel>
                      <Input
                        id="loc-lat"
                        name="latitude"
                        required
                        type="number"
                        step="0.0001"
                        value={locForm.latitude}
                        onChange={(e) =>
                          setLocForm((p) => ({ ...p, latitude: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="loc-lng" required>
                        Longitude
                      </FieldLabel>
                      <Input
                        id="loc-lng"
                        name="longitude"
                        required
                        type="number"
                        step="0.0001"
                        value={locForm.longitude}
                        onChange={(e) =>
                          setLocForm((p) => ({ ...p, longitude: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="xs"
                    variant="outline"
                    disabled={addLocationMutation.isPending}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Save Coordinates
                  </Button>
                </form>
              )}
            </div>

            {/* Historical Trips */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground">
                Recent Trip History ({detail.tripHistory.length})
              </h3>
              {detail.tripHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No completed or assigned trips recorded for this employee.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {detail.tripHistory.map((hist) => (
                    <div
                      key={hist.assignmentId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-semibold text-foreground tabular-nums">
                          {hist.tripCode}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          · {hist.travelDate} ({hist.direction})
                        </span>
                        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          Scheduled {formatLocalTime(hist.scheduledPickupAt)}
                        </p>
                      </div>
                      <StatusBadge tone={statusToneFor(hist.passengerStatus)}>
                        {hist.passengerStatus}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Add Employee Drawer */}
      <SlideOverDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Onboard Employee"
        subtitle="Creates user identity, corporate profile, and optional verified pickup pin"
      >
        <form id="add-emp-form" onSubmit={submitNewEmployee} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="ne-name" required>
                Full Name
              </FieldLabel>
              <Input
                id="ne-name"
                required
                value={newEmp.fullName}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, fullName: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="ne-code" required>
                Employee Code
              </FieldLabel>
              <Input
                id="ne-code"
                required
                placeholder="EMP-HYD-205"
                value={newEmp.employeeCode}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, employeeCode: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="ne-email" required>
                Work Email
              </FieldLabel>
              <Input
                id="ne-email"
                type="email"
                required
                value={newEmp.email}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="ne-phone" required>
                Phone
              </FieldLabel>
              <Input
                id="ne-phone"
                required
                value={newEmp.phone}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="ne-dept" required>
                Department
              </FieldLabel>
              <Input
                id="ne-dept"
                required
                value={newEmp.department}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, department: e.target.value }))
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="ne-office" required>
                Campus Office
              </FieldLabel>
              <Select
                id="ne-office"
                value={newEmp.officeId}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, officeId: e.target.value }))
                }
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="ne-shift">Default Shift</FieldLabel>
            <Select
              id="ne-shift"
              value={newEmp.defaultShiftId}
              onChange={(e) =>
                setNewEmp((p) => ({ ...p, defaultShiftId: e.target.value }))
              }
            >
              <option value="">None (Assign per booking)</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name} ({s.shiftTimeLocal})
                </option>
              ))}
            </Select>
          </div>

          <div className="border-t border-border pt-3 space-y-2.5">
            <p className="text-xs font-semibold text-foreground">
              Initial Verified Pickup Pin (Optional)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <FieldLabel htmlFor="ne-loc-name">Stop name</FieldLabel>
                <Input
                  id="ne-loc-name"
                  name="pickupLocationName"
                  placeholder="e.g. Jubilee Checkpost"
                  value={newEmp.locationName}
                  onChange={(e) =>
                    setNewEmp((p) => ({ ...p, locationName: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="ne-loc-corridor">Corridor</FieldLabel>
                <Input
                  id="ne-loc-corridor"
                  name="pickupCorridorTag"
                  placeholder="e.g. Madhapur"
                  value={newEmp.corridorTag}
                  onChange={(e) =>
                    setNewEmp((p) => ({ ...p, corridorTag: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="ne-loc-addr">Pickup street address</FieldLabel>
              <Input
                id="ne-loc-addr"
                name="pickupAddress"
                placeholder="Street address & landmark"
                value={newEmp.address}
                onChange={(e) =>
                  setNewEmp((p) => ({ ...p, address: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <FieldLabel htmlFor="ne-loc-lat">Latitude</FieldLabel>
                <Input
                  id="ne-loc-lat"
                  name="pickupLatitude"
                  type="number"
                  step="0.0001"
                  value={newEmp.latitude}
                  onChange={(e) =>
                    setNewEmp((p) => ({ ...p, latitude: e.target.value }))
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="ne-loc-lng">Longitude</FieldLabel>
                <Input
                  id="ne-loc-lng"
                  name="pickupLongitude"
                  type="number"
                  step="0.0001"
                  value={newEmp.longitude}
                  onChange={(e) =>
                    setNewEmp((p) => ({ ...p, longitude: e.target.value }))
                  }
                />
              </div>
            </div>
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
            form="add-emp-form"
            disabled={createEmployeeMutation.isPending}
          >
            Save Employee
          </Button>
        </div>
      </SlideOverDrawer>

      {/* CSV Bulk Import Drawer */}
      <SlideOverDrawer
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="CSV Bulk Employee Import"
        subtitle="Creates users, commuter records, and PostGIS pickup coordinates atomically"
        width="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-[#F8FAFC] p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">
                Required Header Columns
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setCsvText(SAMPLE_HYD_CSV)}
              >
                Load Sample Hyderabad CSV
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              email,phone,fullName,employeeCode,department,officeCode,shiftCode,locationName,address,corridorTag,latitude,longitude
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="csv-paste" required>
              CSV Rows
            </FieldLabel>
            <Textarea
              id="csv-paste"
              rows={10}
              className="font-mono text-xs"
              placeholder="Paste CSV text or click Load Sample Hyderabad CSV..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCsvOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!csvText.trim() || importCsvMutation.isPending}
              onClick={() => importCsvMutation.mutate(csvText)}
            >
              Import Employees
            </Button>
          </div>
        </div>
      </SlideOverDrawer>
    </AdminShell>
  );
}

