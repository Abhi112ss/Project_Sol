import crypto from 'node:crypto';
import type { BookingTimePreference, TripDirection } from '../../infrastructure/shared/enums.js';
import { formatTimeLocalInTimezone } from '../bookings/bookings.calendar.js';

export function normalizeCommuteSlug(raw: string | null | undefined, fallback = 'corridor'): string {
  const cleaned = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function resolveLocalityDisplayLabel(input: {
  localityName?: string | null;
  normalizedLocality?: string | null;
  corridorTag?: string | null;
  locationName?: string | null;
}): string {
  return (
    input.localityName?.trim() ||
    input.normalizedLocality?.trim() ||
    input.corridorTag?.trim() ||
    input.locationName?.trim() ||
    'Corridor'
  );
}

export function formatReadableTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function classifyDaypartLabel(hhmm: string, direction: TripDirection): string {
  const hour = Number.parseInt(hhmm.split(':')[0] ?? '9', 10);
  if (Number.isFinite(hour)) {
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  }
  return direction === 'LOGOUT' ? 'Evening' : 'Morning';
}

export interface OperatorCommuteIdentityInput {
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  direction: TripDirection;
  localityLabel: string;
  timePreference: BookingTimePreference;
  requestedTimeLocal?: string | null;
  scheduledPickupAt?: Date;
  timezone?: string | null;
}

export interface CommuteIdentityResult {
  commuteKey: string;
  commuteName: string;
  localitySlug: string;
  requestedTimeLocal: string;
}

export function buildOperatorCommuteIdentity(
  input: OperatorCommuteIdentityInput,
): CommuteIdentityResult {
  const tz = input.timezone?.trim() || 'Asia/Kolkata';
  const timeLocal =
    input.requestedTimeLocal?.trim() ||
    (input.scheduledPickupAt ? formatTimeLocalInTimezone(input.scheduledPickupAt, tz) : '09:00');
  const hhmm = timeLocal.replace(':', '');
  const localitySlug = normalizeCommuteSlug(input.localityLabel);
  const signature = `${input.officeId}|${input.shiftId}|${input.direction}|${localitySlug}|${input.timePreference}|${hhmm}`;
  const shortHash = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 10);

  const routeLabel =
    input.direction === 'LOGIN'
      ? `${input.localityLabel} -> ${input.officeName}`
      : `${input.officeName} -> ${input.localityLabel}`;
  const timingTag =
    input.timePreference === 'ARRIVE_BY'
      ? `Arrive by ${formatReadableTime12h(timeLocal)}`
      : `Pickup ${formatReadableTime12h(timeLocal)}`;

  return {
    commuteKey: `cmt-${localitySlug.slice(0, 24)}-${input.direction.toLowerCase()}-${hhmm}-${shortHash}`,
    commuteName: `${routeLabel} · ${input.shiftName} · ${timingTag}`,
    localitySlug,
    requestedTimeLocal: timeLocal,
  };
}

export interface DriverCommuteIdentityInput {
  officeId: string;
  officeName: string;
  shiftId: string;
  shiftName: string;
  shiftTimeLocal?: string | null;
  direction: TripDirection;
  localityLabel: string;
}

export function buildDriverCommuteIdentity(
  input: DriverCommuteIdentityInput,
): { commuteKey: string; commuteName: string; localitySlug: string } {
  const localitySlug = normalizeCommuteSlug(input.localityLabel);
  const signature = `drv|${input.officeId}|${input.shiftId}|${input.direction}|${localitySlug}`;
  const shortHash = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 10);
  const daypart = classifyDaypartLabel(input.shiftTimeLocal ?? '09:00', input.direction);
  const actionWord = input.direction === 'LOGIN' ? 'Pickup' : 'Drop';

  return {
    commuteKey: `dcmt-${localitySlug.slice(0, 24)}-${input.direction.toLowerCase()}-${shortHash}`,
    commuteName: `${input.localityLabel} ${daypart} ${actionWord}`,
    localitySlug,
  };
}
