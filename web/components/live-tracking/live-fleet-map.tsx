"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { FleetHealthStatus, FleetLiveVehicle, TripBreadcrumbsResponse } from "@/lib/types";

const HYDERABAD_CENTER: [number, number] = [17.4401, 78.3489];

function healthColor(health: FleetHealthStatus): string {
  switch (health) {
    case "LIVE":
      return "#0D9488";
    case "DELAYED":
    case "STALE":
      return "#D97706";
    case "EMERGENCY":
      return "#E11D48";
    case "NO_SIGNAL":
    default:
      return "#5B6E84";
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildVehicleDivIcon(
  vehicle: FleetLiveVehicle,
  isSelected: boolean,
): L.DivIcon {
  const color = healthColor(vehicle.health);
  const plate = escapeHtml(vehicle.vehicleRegistrationNo ?? vehicle.tripCode);
  const heading = vehicle.gpsTelemetry?.headingDeg ?? 0;
  const ring = isSelected
    ? "box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35), 0 4px 12px rgba(15, 37, 68, 0.22);"
    : "box-shadow: 0 2px 8px rgba(15, 37, 68, 0.18);";
  const borderCol = isSelected ? "#2563EB" : color;

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);pointer-events:auto;">
      <div style="width:34px;height:34px;border-radius:9999px;background:#FFFFFF;border:2.5px solid ${borderCol};display:flex;align-items:center;justify-content:center;${ring}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="transform:rotate(${heading}deg);">
          <path d="M12 3L19 20L12 16.2L5 20L12 3Z" fill="${color}" />
        </svg>
      </div>
      <div style="margin-top:3px;padding:1px 6px;border-radius:5px;background:#0F2544;color:#FFFFFF;font-family:var(--font-mono),monospace;font-size:10px;font-weight:600;white-space:nowrap;line-height:1.4;letter-spacing:0.01em;">
        ${plate}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "sol-fleet-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function buildStopDivIcon(sequenceNo: number, isOffice: boolean, status: string): L.DivIcon {
  const bg = isOffice
    ? "#0F2544"
    : status === "COMPLETED"
      ? "#0D9488"
      : status === "ARRIVED"
        ? "#D97706"
        : "#2563EB";
  const label = isOffice ? "HQ" : String(sequenceNo);
  const html = `
    <div style="width:24px;height:24px;border-radius:${isOffice ? "6px" : "9999px"};background:${bg};color:#FFFFFF;border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(15,37,68,0.22);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono),monospace;font-size:10px;font-weight:700;transform:translate(-50%,-50%);">
      ${label}
    </div>
  `;
  return L.divIcon({
    html,
    className: "sol-stop-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function LiveFleetMap({
  vehicles,
  offices,
  selectedTripId,
  breadcrumbs,
  fitRequestKey,
  onSelectTrip,
}: {
  vehicles: FleetLiveVehicle[];
  offices: Array<{ id: string; name: string; code: string; latitude: number; longitude: number }>;
  selectedTripId: string | null;
  breadcrumbs: TripBreadcrumbsResponse | null;
  fitRequestKey: number;
  onSelectTrip: (tripId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const officesLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const fleetLayerRef = useRef<L.LayerGroup | null>(null);
  const lastCenteredTripRef = useRef<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: HYDERABAD_CENTER,
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });

    const tileUrl =
      process.env.NEXT_PUBLIC_OSM_TILE_URL ??
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    L.tileLayer(tileUrl, {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    officesLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    fleetLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      officesLayerRef.current = null;
      routeLayerRef.current = null;
      fleetLayerRef.current = null;
    };
  }, []);

  // Render campus office beacons
  useEffect(() => {
    const layer = officesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const office of offices) {
      const marker = L.circleMarker([office.latitude, office.longitude], {
        radius: 6,
        color: "#0F2544",
        weight: 2,
        fillColor: "#FFFFFF",
        fillOpacity: 1,
      });
      marker.bindTooltip(`${office.name} (${office.code})`, { direction: "top" });
      marker.addTo(layer);
    }
  }, [offices]);

  // Render active vehicle markers & live accuracy circles
  useEffect(() => {
    const layer = fleetLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    for (const vehicle of vehicles) {
      const gps = vehicle.gpsTelemetry;
      const latLng: [number, number] | null = gps
        ? [gps.latitude, gps.longitude]
        : vehicle.nextStop
          ? [vehicle.nextStop.latitude, vehicle.nextStop.longitude]
          : null;
      if (!latLng) continue;

      const selected = vehicle.id === selectedTripId;
      if (gps && gps.accuracyM != null && gps.accuracyM > 0 && selected) {
        L.circle(latLng, {
          radius: Math.min(gps.accuracyM, 400),
          color: healthColor(vehicle.health),
          weight: 1,
          fillColor: healthColor(vehicle.health),
          fillOpacity: 0.1,
        }).addTo(layer);
      }

      const marker = L.marker(latLng, {
        icon: buildVehicleDivIcon(vehicle, selected),
        zIndexOffset: selected ? 600 : 100,
      });
      marker.on("click", () => onSelectTrip(vehicle.id));
      marker.addTo(layer);
    }
  }, [vehicles, selectedTripId, onSelectTrip]);

  // Render selected sortie stop pins & GPS breadcrumb trail
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    const selected = vehicles.find((v) => v.id === selectedTripId) ?? null;
    if (!selected) return;

    if (selected.stops.length > 0) {
      const stopCoords = selected.stops.map((s) => [s.latitude, s.longitude] as [number, number]);
      L.polyline(stopCoords, {
        color: "#2563EB",
        weight: 3,
        opacity: 0.45,
        dashArray: "6 6",
      }).addTo(layer);

      for (const stop of selected.stops) {
        const stopMarker = L.marker([stop.latitude, stop.longitude], {
          icon: buildStopDivIcon(stop.sequenceNo, stop.stopType === "OFFICE", stop.status),
        });
        stopMarker.bindTooltip(
          `#${stop.sequenceNo} ${stop.locationName} (${stop.status})`,
          { direction: "top" },
        );
        stopMarker.addTo(layer);
      }
    }

    if (breadcrumbs && breadcrumbs.tripId === selected.id && breadcrumbs.points.length >= 2) {
      const trail = breadcrumbs.points.map(
        (pt) => [pt.latitude, pt.longitude] as [number, number],
      );
      L.polyline(trail, {
        color: "#0D9488",
        weight: 4,
        opacity: 0.85,
      }).addTo(layer);
    }

    if (lastCenteredTripRef.current !== selected.id) {
      lastCenteredTripRef.current = selected.id;
      const pts: [number, number][] = [
        ...selected.stops.map((s) => [s.latitude, s.longitude] as [number, number]),
      ];
      if (selected.gpsTelemetry) {
        pts.push([selected.gpsTelemetry.latitude, selected.gpsTelemetry.longitude]);
      }
      if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
      } else if (pts.length === 1) {
        map.setView(pts[0], 13);
      }
    }
  }, [vehicles, selectedTripId, breadcrumbs]);

  // Fit-all trigger
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitRequestKey === 0) return;

    const pts: [number, number][] = [];
    for (const v of vehicles) {
      if (v.gpsTelemetry) {
        pts.push([v.gpsTelemetry.latitude, v.gpsTelemetry.longitude]);
      } else if (v.nextStop) {
        pts.push([v.nextStop.latitude, v.nextStop.longitude]);
      }
    }
    for (const o of offices) {
      pts.push([o.latitude, o.longitude]);
    }
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [42, 42], maxZoom: 13 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 12);
    }
  }, [fitRequestKey, vehicles, offices]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Live fleet geospatial map of Hyderabad transport routes"
      className="relative z-0 isolate h-full min-h-[420px] w-full bg-[#EAF0F8]"
    />
  );
}

