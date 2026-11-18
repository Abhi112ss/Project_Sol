import { describe, expect, it } from 'vitest';
import {
  buildDriverCommuteIdentity,
  buildOperatorCommuteIdentity,
  normalizeCommuteSlug,
  resolveLocalityDisplayLabel,
} from './commutes.utils.js';

describe('Commute Identity & Naming Helpers', () => {
  it('groups compatible operator recurring requests with identical deterministic commuteKey', () => {
    const a = buildOperatorCommuteIdentity({
      officeId: '22222222-2222-4222-8222-222222222201',
      officeName: 'Gachibowli Campus',
      shiftId: '44444444-4444-4444-8444-444444444401',
      shiftName: 'Morning Login S1',
      direction: 'LOGIN',
      localityLabel: 'Chinthal',
      timePreference: 'ARRIVE_BY',
      requestedTimeLocal: '08:00',
    });

    const b = buildOperatorCommuteIdentity({
      officeId: '22222222-2222-4222-8222-222222222201',
      officeName: 'Gachibowli Campus',
      shiftId: '44444444-4444-4444-8444-444444444401',
      shiftName: 'Morning Login S1',
      direction: 'LOGIN',
      localityLabel: 'Chinthal',
      timePreference: 'ARRIVE_BY',
      requestedTimeLocal: '08:00',
    });

    expect(a.commuteKey).toBe(b.commuteKey);
    expect(a.commuteKey).toMatch(/^cmt-chinthal-login-0800-[a-f0-9]{10}$/);
    expect(a.commuteName).toContain('Chinthal -> Gachibowli Campus');
    expect(a.commuteName).toContain('Arrive by 8:00 AM');
  });

  it('separates different localities and directions cleanly for both operators and drivers', () => {
    const chinthalPickup = buildDriverCommuteIdentity({
      officeId: '22222222-2222-4222-8222-222222222201',
      officeName: 'Gachibowli Campus',
      shiftId: '44444444-4444-4444-8444-444444444401',
      shiftName: 'Morning Login S1',
      shiftTimeLocal: '09:00',
      direction: 'LOGIN',
      localityLabel: 'Chinthal',
    });

    const miyapurDrop = buildDriverCommuteIdentity({
      officeId: '22222222-2222-4222-8222-222222222201',
      officeName: 'Gachibowli Campus',
      shiftId: '44444444-4444-4444-8444-444444444402',
      shiftName: 'Evening Logout S2',
      shiftTimeLocal: '18:30',
      direction: 'LOGOUT',
      localityLabel: 'Miyapur',
    });

    expect(chinthalPickup.commuteName).toBe('Chinthal Morning Pickup');
    expect(miyapurDrop.commuteName).toBe('Miyapur Evening Drop');
    expect(chinthalPickup.commuteKey).not.toBe(miyapurDrop.commuteKey);
    expect(normalizeCommuteSlug('  KPHB Phase 1 / Metro  ')).toBe('kphb-phase-1-metro');
    expect(
      resolveLocalityDisplayLabel({
        localityName: 'Chinthal',
        normalizedLocality: 'Chintal',
        locationName: 'Stop 1',
      }),
    ).toBe('Chinthal');
  });
});
