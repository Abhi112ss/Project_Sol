import { describe, expect, it } from 'vitest';
import {
  computeScheduleForTimePreference,
  expandSeriesDates,
  localDateTimeToUtcDate,
  resolveSeriesEndDate,
} from './bookings.calendar.js';

describe('bookings calendar and time preference helpers', () => {
  it('computes true calendar week & calendar month boundaries including Feb non-leap & leap years', () => {
    expect(
      resolveSeriesEndDate({
        recurrenceType: 'WEEKLY',
        startDate: '2026-11-23',
      }),
    ).toBe('2026-11-29');

    // Non-leap Feb 2026 -> 28 days inclusive
    expect(
      resolveSeriesEndDate({
        recurrenceType: 'MONTHLY',
        startDate: '2026-02-01',
      }),
    ).toBe('2026-02-28');

    // Leap Feb 2028 -> 29 days inclusive
    expect(
      resolveSeriesEndDate({
        recurrenceType: 'MONTHLY',
        startDate: '2028-02-01',
      }),
    ).toBe('2028-02-29');

    // 31-day March -> 31 days inclusive
    expect(
      resolveSeriesEndDate({
        recurrenceType: 'MONTHLY',
        startDate: '2026-03-01',
      }),
    ).toBe('2026-03-31');
  });

  it('expands weekday-filtered WEEKLY series accurately', () => {
    const expanded = expandSeriesDates({
      recurrenceType: 'WEEKLY',
      startDate: '2026-11-23', // Monday
      selectedDaysOfWeek: ['MON', 'WED', 'FRI'],
    });

    expect(expanded.endDate).toBe('2026-11-29');
    expect(expanded.dates.map((d) => d.travelDate)).toEqual([
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
    ]);
  });

  it('converts Asia/Kolkata local wall clock to exact UTC timestamp', () => {
    const utc = localDateTimeToUtcDate('2026-11-25', '08:30', 'Asia/Kolkata');
    expect(utc.toISOString()).toBe('2026-11-25T03:00:00.000Z');
  });

  it('computes backward pickup time for feasible and infeasible ARRIVE_BY requests', () => {
    const futureNow = new Date('2026-11-24T00:00:00.000Z');
    const feasible = computeScheduleForTimePreference({
      travelDate: '2026-11-25',
      direction: 'LOGIN',
      timePreference: 'ARRIVE_BY',
      requestedTimeLocal: '09:00',
      timezone: 'Asia/Kolkata',
      pickupLat: 17.4849,
      pickupLng: 78.4138,
      officeLat: 17.4401,
      officeLng: 78.3489,
      arriveBySafetyBufferMinutes: 10,
      bookingCutoffMinutes: 120,
      now: futureNow,
    });

    expect(feasible.isArriveByInfeasible).toBe(false);
    expect(feasible.scheduledPickupAt.getTime()).toBeLessThan(feasible.requestedPickupAt.getTime());

    // Now simulate last-minute ARRIVE_BY with only 15 minutes remaining before office deadline
    const tightNow = new Date('2026-11-25T03:15:00.000Z'); // 08:45 IST, wants 09:00 IST arrival
    const infeasible = computeScheduleForTimePreference({
      travelDate: '2026-11-25',
      direction: 'LOGIN',
      timePreference: 'ARRIVE_BY',
      requestedTimeLocal: '09:00',
      timezone: 'Asia/Kolkata',
      pickupLat: 17.4849,
      pickupLng: 78.4138,
      officeLat: 17.4401,
      officeLng: 78.3489,
      arriveBySafetyBufferMinutes: 10,
      bookingCutoffMinutes: 120,
      now: tightNow,
    });

    expect(infeasible.isArriveByInfeasible).toBe(true);
    expect(infeasible.feasibilityNote).toContain('cutoff');
  });
});
