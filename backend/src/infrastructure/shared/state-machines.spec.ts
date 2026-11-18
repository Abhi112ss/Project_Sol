import { ConflictException } from '@nestjs/common';
import {
  assertPassengerTransition,
  assertTripTransition,
  isPassengerPendingForRouting,
} from './state-machines.js';

describe('state-machines', () => {
  it('allows valid trip lifecycle progression', () => {
    expect(() => assertTripTransition('CREATED', 'ASSIGNED')).not.toThrow();
    expect(() => assertTripTransition('ASSIGNED', 'DRIVER_ACCEPTED')).not.toThrow();
    expect(() => assertTripTransition('DRIVER_ACCEPTED', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertTripTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
  });

  it('rejects backward or terminal trip transitions', () => {
    expect(() => assertTripTransition('COMPLETED', 'IN_PROGRESS')).toThrow(ConflictException);
    expect(() => assertTripTransition('CANCELLED', 'ASSIGNED')).toThrow(ConflictException);
  });

  it('enforces passenger arrival before boarding or no-show', () => {
    expect(() => assertPassengerTransition('SCHEDULED', 'BOARDED')).toThrow(ConflictException);
    expect(() => assertPassengerTransition('SCHEDULED', 'NO_SHOW')).toThrow(ConflictException);
    expect(() => assertPassengerTransition('EN_ROUTE', 'ARRIVED')).not.toThrow();
    expect(() => assertPassengerTransition('ARRIVED', 'BOARDED')).not.toThrow();
    expect(() => assertPassengerTransition('ARRIVED', 'NO_SHOW')).not.toThrow();
  });

  it('identifies only pending stops for automatic pickup progression', () => {
    expect(isPassengerPendingForRouting('SCHEDULED')).toBe(true);
    expect(isPassengerPendingForRouting('EN_ROUTE')).toBe(true);
    expect(isPassengerPendingForRouting('ARRIVED')).toBe(true);
    expect(isPassengerPendingForRouting('BOARDED')).toBe(false);
    expect(isPassengerPendingForRouting('NO_SHOW')).toBe(false);
    expect(isPassengerPendingForRouting('CANCELLED')).toBe(false);
  });
});

