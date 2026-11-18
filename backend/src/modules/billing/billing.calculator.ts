import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';

export const STOP_CORRIDOR_CIRCUITY_FACTOR = 1.22;

export interface GeoCoord {
  latitude: number;
  longitude: number;
}

export type DistanceSource = 'GPS_TRACE' | 'STOP_CORRIDOR_ESTIMATE';

export interface TripDistanceResult {
  distanceKm: number;
  distanceSource: DistanceSource;
}

export interface TripLineInput {
  tripId: string;
  tripCode: string;
  travelDate: string;
  direction: string;
  shiftName: string;
  driverName: string | null;
  vehicleRegistrationNo: string | null;
  boardedCount: number;
  noShowCount: number;
  delayedStopsCount: number;
  distanceKm: number;
  distanceSource: DistanceSource;
  baseTripPaise: number;
  ratePerKmPaise: number;
}

export interface TripLineBilling extends TripLineInput {
  baseFeePaise: number;
  distanceFeePaise: number;
  lineSubtotalPaise: number;
  disputeFlags: string[];
}

export interface InvoiceTotals {
  totalTrips: number;
  totalDistanceKm: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstBps: number;
}

export function roundDistanceKm(km: number): number {
  return Math.round(km * 100) / 100;
}

/**
 * Sums great-circle distance in kilometers along an ordered list of points.
 */
export function computePolylineDistanceKm(points: GeoCoord[]): number {
  if (points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segmentMeters = haversineDistanceMeters(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude,
    );
    if (Number.isFinite(segmentMeters) && segmentMeters >= 0) {
      totalMeters += segmentMeters;
    }
  }
  return roundDistanceKm(totalMeters / 1000);
}

/**
 * Computes deterministic trip distance in km without paid external distance APIs.
 * Prefers recorded GPS polyline (>= 0.2 km trace), otherwise scales ordered stop corridor by 1.22x urban road factor.
 */
export function computeTripDistanceKm(
  gpsPoints: GeoCoord[],
  stopPoints: GeoCoord[],
): TripDistanceResult {
  const gpsKm = computePolylineDistanceKm(gpsPoints);
  if (gpsPoints.length >= 2 && gpsKm >= 0.2) {
    return { distanceKm: gpsKm, distanceSource: 'GPS_TRACE' };
  }

  const corridorKm = roundDistanceKm(
    computePolylineDistanceKm(stopPoints) * STOP_CORRIDOR_CIRCUITY_FACTOR,
  );
  return {
    distanceKm: corridorKm,
    distanceSource: 'STOP_CORRIDOR_ESTIMATE',
  };
}

/**
 * Integer-paise line billing for a completed trip against vendor tariff schedule.
 */
export function calculateTripLineBilling(input: TripLineInput): TripLineBilling {
  const baseFeePaise = Math.max(0, Math.round(input.baseTripPaise));
  const distanceFeePaise = Math.max(0, Math.round(input.distanceKm * input.ratePerKmPaise));
  const lineSubtotalPaise = baseFeePaise + distanceFeePaise;

  const disputeFlags: string[] = [];
  if (input.distanceSource === 'STOP_CORRIDOR_ESTIMATE') {
    disputeFlags.push('NO_GPS_TRACE_CORRIDOR_EST');
  }
  if (input.delayedStopsCount > 0) {
    disputeFlags.push(`DELAYED_STOPS_${input.delayedStopsCount}`);
  }
  if (input.boardedCount === 0 && input.noShowCount > 0) {
    disputeFlags.push('ZERO_BOARDED_NO_SHOW_ONLY');
  }

  return {
    ...input,
    baseFeePaise,
    distanceFeePaise,
    lineSubtotalPaise,
    disputeFlags,
  };
}

/**
 * Computes subtotal, GST tax, and final grand total in integer INR paise.
 */
export function calculateInvoiceTotals(
  lines: Array<{ distanceKm: number; lineSubtotalPaise: number }>,
  gstBps = 500,
): InvoiceTotals {
  const totalTrips = lines.length;
  const totalDistanceKm = roundDistanceKm(lines.reduce((sum, l) => sum + l.distanceKm, 0));
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineSubtotalPaise, 0);
  const taxPaise = Math.round((subtotalPaise * gstBps) / 10_000);
  const totalPaise = subtotalPaise + taxPaise;

  return {
    totalTrips,
    totalDistanceKm,
    subtotalPaise,
    taxPaise,
    totalPaise,
    gstBps,
  };
}

export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const formulaSafe =
    raw.startsWith('=') || raw.startsWith('@') || raw.startsWith('\t') || raw.startsWith('\r')
      ? `'${raw}`
      : raw;
  if (formulaSafe.includes(',') || formulaSafe.includes('"') || formulaSafe.includes('\n')) {
    return `"${formulaSafe.replaceAll('"', '""')}"`;
  }
  return formulaSafe;
}

export function formatInvoiceStatementCsv(input: {
  invoiceNumber: string;
  vendorName: string;
  vendorCode: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  currency: string;
  totals: InvoiceTotals;
  lineItems: TripLineBilling[];
}): string {
  const headers = [
    'invoice_number',
    'vendor_code',
    'vendor_name',
    'period_start',
    'period_end',
    'invoice_status',
    'trip_code',
    'travel_date',
    'direction',
    'shift_name',
    'driver_name',
    'vehicle_registration',
    'boarded_count',
    'no_show_count',
    'delayed_stops',
    'distance_km',
    'distance_source',
    'base_fee_inr',
    'distance_fee_inr',
    'line_subtotal_inr',
    'dispute_flags',
  ];

  const rows = input.lineItems.map((line) => [
    input.invoiceNumber,
    input.vendorCode,
    input.vendorName,
    input.periodStart,
    input.periodEnd,
    input.status,
    line.tripCode,
    line.travelDate,
    line.direction,
    line.shiftName,
    line.driverName ?? 'Unassigned',
    line.vehicleRegistrationNo ?? 'Unassigned',
    line.boardedCount,
    line.noShowCount,
    line.delayedStopsCount,
    line.distanceKm.toFixed(2),
    line.distanceSource,
    (line.baseFeePaise / 100).toFixed(2),
    (line.distanceFeePaise / 100).toFixed(2),
    (line.lineSubtotalPaise / 100).toFixed(2),
    line.disputeFlags.join(' | '),
  ]);

  const summaryRow = [
    input.invoiceNumber,
    input.vendorCode,
    input.vendorName,
    input.periodStart,
    input.periodEnd,
    input.status,
    'TOTAL',
    '',
    '',
    `Trips: ${input.totals.totalTrips}`,
    `GST ${(input.totals.gstBps / 100).toFixed(2)}%`,
    input.currency,
    '',
    '',
    '',
    input.totals.totalDistanceKm.toFixed(2),
    `Tax INR ${(input.totals.taxPaise / 100).toFixed(2)}`,
    '',
    (input.totals.subtotalPaise / 100).toFixed(2),
    (input.totals.totalPaise / 100).toFixed(2),
    'Subtotal + Tax = Total',
  ];

  return [headers, ...rows, summaryRow]
    .map((row) => row.map((cell) => escapeCsvField(cell)).join(','))
    .join('\r\n');
}
