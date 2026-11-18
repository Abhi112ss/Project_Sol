"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Anchor,
  Building2,
  CarFront,
  CheckSquare,
  FileBarChart2,
  GitBranch,
  History,
  Menu,
  Radio,
  Receipt,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import type { OfficeItem, OverviewData, UserRole } from "@/lib/types";
import { useDevSession } from "@/components/providers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "dispatch" | "registry" | "governance";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: Activity, group: "dispatch" },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, group: "dispatch" },
  { href: "/dispatch", label: "Dispatch", icon: GitBranch, group: "dispatch" },
  { href: "/live-tracking", label: "Live Tracking", icon: Radio, group: "dispatch" },
  { href: "/trips", label: "Trips", icon: History, group: "dispatch" },
  { href: "/safety", label: "Safety & Appeals", icon: ShieldAlert, group: "dispatch" },
  { href: "/employees", label: "Employees", icon: Users, group: "registry" },
  { href: "/drivers", label: "Drivers", icon: UserCheck, group: "registry" },
  { href: "/vehicles", label: "Vehicles", icon: CarFront, group: "registry" },
  { href: "/vendors", label: "Vendors & Shifts", icon: Building2, group: "registry" },
  { href: "/reports", label: "Reports", icon: FileBarChart2, group: "governance" },
  { href: "/billing", label: "Billing", icon: Receipt, group: "governance" },
  { href: "/settings", label: "Settings", icon: Settings, group: "governance" },
];

const NAV_GROUPS: Array<{ id: NavItem["group"]; label: string }> = [
  { id: "dispatch", label: "Bridge Operations" },
  { id: "registry", label: "Fleet & People" },
  { id: "governance", label: "Governance" },
];

export function AdminShell({
  title,
  subtitle,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const officeFilterId = useId();
  const roleSwitcherId = useId();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prevFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeBtn =
      mobileDrawerRef.current?.querySelector<HTMLElement>("button");
    closeBtn?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [mobileNavOpen]);
  const {
    identity,
    setPersonaByRole,
    personas,
    activeOfficeId,
    setActiveOfficeId,
  } = useDevSession();

  const { data: offices } = useQuery({
    queryKey: ["offices", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OfficeItem[]>("/admin/offices", identity),
  });

  const { data: overview } = useQuery({
    queryKey: ["overview-badge", identity.orgId, identity.userId, identity.role],
    queryFn: () => apiRequest<OverviewData>("/admin/overview", identity),
    retry: false,
  });

  const isRouteActive = (href: string) => {
    if (href === "/overview" && (pathname === "/" || pathname === "/overview")) {
      return true;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const openAlertsCount = overview?.kpis.activeEmergencies ?? 0;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[52px] items-center justify-between border-b border-sidebar-border px-4">
        <Link href="/overview" className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs">
            <Anchor className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
              SolTransit
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground tabular-nums">
              HYD · BRIDGE v1
            </span>
          </div>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation menu"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <nav aria-label="Control panel sections" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group.id).map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-[background-color,color] duration-150",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                      {item.href === "/approvals" &&
                        (overview?.kpis.pendingApprovals ?? 0) > 0 && (
                          <span className="ml-auto rounded bg-[#FFFBEB] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#B45309] tabular-nums">
                            {overview?.kpis.pendingApprovals}
                          </span>
                        )}
                      {item.href === "/dispatch" &&
                        (overview?.kpis.approvedAwaitingDispatch ?? 0) > 0 && (
                          <span className="ml-auto rounded bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#1D4ED8] tabular-nums">
                            {overview?.kpis.approvedAwaitingDispatch}
                          </span>
                        )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3.5 py-3 text-xs">
        <p className="font-medium text-foreground truncate">{identity.orgName}</p>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
          <span>IST (UTC+05:30)</span>
          <span>DEV MODE</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full bg-background text-foreground">
      {/* Persistent Desktop Bridge Rail */}
      <aside className="hidden lg:block w-[224px] shrink-0 border-r border-sidebar-border bg-sidebar sticky top-0 h-dvh">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
        >
          <div
            className="fixed inset-0 bg-[#0F2544]/35 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={mobileDrawerRef}
            className="relative z-10 h-full w-[240px] bg-sidebar shadow-[var(--shadow-drawer)]"
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Telemetry Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="harbor-header-glass sticky top-0 z-30 flex min-h-[54px] flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 border-b border-border px-4 py-2 lg:px-6">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="size-4" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle && (
                <p className="hidden sm:block truncate text-xs text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 xl:w-auto xl:shrink-0">
            {headerActions}

            <div className="hidden md:block w-36 xl:w-40">
              <Select
                id={officeFilterId}
                name="officeFilter"
                aria-label="Filter campus office"
                value={activeOfficeId}
                onChange={(e) => setActiveOfficeId(e.target.value)}
                className="h-8 text-xs"
              >
                <option value="">All campuses</option>
                {offices?.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.code} · {office.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="min-w-[160px] flex-1 sm:flex-initial sm:w-44 xl:w-48">
              <Select
                id={roleSwitcherId}
                name="devRole"
                aria-label="Switch dev RBAC role"
                value={identity.role}
                onChange={(e) => setPersonaByRole(e.target.value as UserRole)}
                className="h-8 text-xs font-medium"
              >
                {personas.map((persona) => (
                  <option key={persona.role} value={persona.role}>
                    {persona.label}
                  </option>
                ))}
              </Select>
            </div>

            <Link href="/safety" className="shrink-0">
              <StatusBadge
                tone={openAlertsCount > 0 ? "crimson" : "emerald"}
                dot
                className="py-1"
              >
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                <span>{openAlertsCount} Alerts</span>
              </StatusBadge>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
