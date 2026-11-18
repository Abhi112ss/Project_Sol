import {
  type BookingRecurrenceType,
  type DayOfWeekCode,
  DAYS_OF_WEEK,
} from '../../infrastructure/shared/enums.js';
import {
  estimateRoadKm,
  estimateRoadTravelMinutes,
  STOP_DWELL_MINUTES,
} from '../routing/vrptw.solver.js';

const JS_DAY_TO_ENUM: DayOfWeekCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [y, m, d] = isoDate.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function formatIsoDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarDays(isoDate: string, deltaDays: number): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatIsoDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function getDayOfWeekForIsoDate(isoDate: string): DayOfWeekCode {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return JS_DAY_TO_ENUM[dt.getUTCDay()];
}

/**
 * Computes inclusive endDate using true calendar boundaries:
 * - ONE_DAY -> startDate
 * - WEEKLY -> startDate + 6 days (7 calendar days)
 * - MONTHLY -> (true calendar month anniversary) - 1 day (handles 28/29 Feb, 30/31 day months cleanly)
 */
export function resolveSeriesEndDate(input: {
  recurrenceType: BookingRecurrenceType;
  startDate: string;
  endDate?: string;
}): string {
  if (input.endDate) return input.endDate;
  if (input.recurrenceType === 'ONE_DAY') return input.startDate;
  if (input.recurrenceType === 'WEEKLY') return addCalendarDays(input.startDate, 6);
  if (input.recurrenceType === 'MONTHLY') {
    const { year, month, day } = parseIsoDateParts(input.startDate);
    const nextMonthZeroIndexed = month; // current 1-based month == next 0-based month
    const targetYear = year + Math.floor(nextMonthZeroIndexed / 12);
    const targetMonth = (nextMonthZeroIndexed % 12) + 1;
    const clampedDay = Math.min(day, daysInCalendarMonth(targetYear, targetMonth));
    const anniversary = formatIsoDateParts(targetYear, targetMonth, clampedDay);
    return addCalendarDays(anniversary, -1);
  }
  return input.startDate;
}

export function expandSeriesDates(input: {
  recurrenceType: BookingRecurrenceType;
  startDate: string;
  endDate?: string;
  selectedDaysOfWeek?: DayOfWeekCode[];
}): {
  startDate: string;
  endDate: string;
  selectedDaysOfWeek: DayOfWeekCode[];
  dates: Array<{ travelDate: string; dayOfWeek: DayOfWeekCode }>;
} {
  const resolvedEnd = resolveSeriesEndDate(input);
  if (resolvedEnd < input.startDate) {
    return {
      startDate: input.startDate,
      endDate: resolvedEnd,
      selectedDaysOfWeek: [],
      dates: [],
    };
  }

  const effectiveDays: DayOfWeekCode[] =
    input.recurrenceType === 'ONE_DAY'
      ? [getDayOfWeekForIsoDate(input.startDate)]
      : input.selectedDaysOfWeek && input.selectedDaysOfWeek.length > 0
        ? [...new Set(input.selectedDaysOfWeek)]
        : ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  const allowedSet = new Set<DayOfWeekCode>(effectiveDays);
  const dates: Array<{ travelDate: string; dayOfWeek: DayOfWeekCode }> = [];

  let cursor = input.startDate;
  for (let guard = 0; guard < 185 && cursor <= resolvedEnd; guard++) {
    const dow = getDayOfWeekForIsoDate(cursor);
    if (allowedSet.has(dow)) {
      dates.push({ travelDate: cursor, dayOfWeek: dow });
    }
    cursor = addCalendarDays(cursor, 1);
  }

  return {
    startDate: input.startDate,
    endDate: resolvedEnd,
    selectedDaysOfWeek: effectiveDays.filter((d) => DAYS_OF_WEEK.includes(d)),
    dates,
  };
}

/**
 * Converts a local date ('YYYY-MM-DD') + 'HH:MM' in an IANA timezone to a UTC Date.
 */
export function localDateTimeToUtcDate(
  isoDate: string,
  timeLocal: string,
  timezone = 'Asia/Kolkata',
): Date {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const [hour, minute] = timeLocal.split(':').map(Number);

  // Initial UTC guess treating wall clock as UTC, then measure TZ offset via Intl.DateTimeFormat
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcGuessMs)).map((p) => [p.type, p.value]),
  );
  const tzYear = Number(parts.year);
  const tzMonth = Number(parts.month);
  const tzDay = Number(parts.day);
  const tzHour = Number(parts.hour === '24' ? '0' : parts.hour);
  const tzMin = Number(parts.minute);
  const tzSec = Number(parts.second);

  const tzWallAsUtcMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, tzSec, 0);
  const offsetMs = tzWallAsUtcMs - utcGuessMs;
  return new Date(utcGuessMs - offsetMs);
}

export function formatTimeLocalInTimezone(date: Date, timezone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

export function formatIsoDateInTimezone(date: Date, timezone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export interface ComputedTimePreferenceSchedule {
  requestedPickupAt: Date;
  scheduledPickupAt: Date;
  estimatedArrivalAt: Date;
  estimatedTravelMinutes: number;
  isArriveByInfeasible: boolean;
  feasibilityNote: string | null;
}

export function computeScheduleForTimePreference(input: {
  travelDate: string;
  direction: 'LOGIN' | 'LOGOUT';
  timePreference: 'PICKUP_AT' | 'ARRIVE_BY';
  requestedTimeLocal: string;
  timezone: string;
  pickupLat: number;
  pickupLng: number;
  officeLat: number;
  officeLng: number;
  arriveBySafetyBufferMinutes: number;
  bookingCutoffMinutes: number;
  now?: Date;
}): ComputedTimePreferenceSchedule {
  const targetInstant = localDateTimeToUtcDate(
    input.travelDate,
    input.requestedTimeLocal,
    input.timezone,
  );
  const directKm = estimateRoadKm(
    input.pickupLat,
    input.pickupLng,
    input.officeLat,
    input.officeLng,
  );
  const travelMinutes = estimateRoadTravelMinutes(directKm) + STOP_DWELL_MINUTES;
  const travelMs = travelMinutes * 60_000;
  const safetyMs = Math.max(0, input.arriveBySafetyBufferMinutes) * 60_000;
  const nowMs = (input.now ?? new Date()).getTime();

  if (input.timePreference === 'PICKUP_AT') {
    return {
      requestedPickupAt: targetInstant,
      scheduledPickupAt: targetInstant,
      estimatedArrivalAt: new Date(targetInstant.getTime() + travelMs),
      estimatedTravelMinutes: travelMinutes,
      isArriveByInfeasible: false,
      feasibilityNote: null,
    };
  }

  // ARRIVE_BY: compute required pickup time backward from desired arrival
  const requiredPickupAt = new Date(targetInstant.getTime() - travelMs - safetyMs);
  const leadMinutesAvailable = Math.round((requiredPickupAt.getTime() - nowMs) / 60_000);
  const reqPickupLocal = formatTimeLocalInTimezone(requiredPickupAt, input.timezone);

  if (leadMinutesAvailable < input.bookingCutoffMinutes) {
    return {
      requestedPickupAt: targetInstant,
      scheduledPickupAt: requiredPickupAt,
      estimatedArrivalAt: targetInstant,
      estimatedTravelMinutes: travelMinutes,
      isArriveByInfeasible: true,
      feasibilityNote: `ARRIVE_BY ${input.requestedTimeLocal} requires pickup around ${reqPickupLocal} (~${travelMinutes}m drive + ${input.arriveBySafetyBufferMinutes}m buffer), leaving ${leadMinutesAvailable}m lead time (< ${input.bookingCutoffMinutes}m policy cutoff).`,
    };
  }

  return {
    requestedPickupAt: targetInstant,
    scheduledPickupAt: requiredPickupAt,
    estimatedArrivalAt: targetInstant,
    estimatedTravelMinutes: travelMinutes,
    isArriveByInfeasible: false,
    feasibilityNote: `Scheduled pickup ~${reqPickupLocal} (${travelMinutes}m est. drive + ${input.arriveBySafetyBufferMinutes}m buffer to arrive by ${input.requestedTimeLocal}).`,
  };
}
