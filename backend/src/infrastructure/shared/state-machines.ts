import { ConflictException } from '@nestjs/common';
import type { PassengerAssignmentStatus, TripStatus } from './enums.js';

export const TRIP_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['DRIVER_ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
  DRIVER_ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ABORTED'],
  COMPLETED: [],
  CANCELLED: [],
  ABORTED: [],
};

export const PASSENGER_TRANSITIONS: Record<
  PassengerAssignmentStatus,
  readonly PassengerAssignmentStatus[]
> = {
  SCHEDULED: ['EN_ROUTE', 'CANCELLED', 'SKIPPED'],
  EN_ROUTE: ['ARRIVED', 'CANCELLED', 'SKIPPED'],
  ARRIVED: ['BOARDED', 'NO_SHOW', 'SKIPPED', 'CANCELLED'],
  BOARDED: ['DROPPED'],
  NO_SHOW: [],
  CANCELLED: [],
  SKIPPED: [],
  DROPPED: [],
};

export function assertTripTransition(from: TripStatus, to: TripStatus): void {
  if (!TRIP_TRANSITIONS[from].includes(to)) {
    throw new ConflictException({
      code: 'INVALID_STATE_TRANSITION',
      message: `Trip cannot transition from ${from} to ${to}.`,
      details: { entity: 'trip', from, to },
    });
  }
}

export function assertPassengerTransition(
  from: PassengerAssignmentStatus,
  to: PassengerAssignmentStatus,
): void {
  if (!PASSENGER_TRANSITIONS[from].includes(to)) {
    throw new ConflictException({
      code: 'INVALID_STATE_TRANSITION',
      message: `Passenger assignment cannot transition from ${from} to ${to}.`,
      details: { entity: 'passenger_assignment', from, to },
    });
  }
}

export function isPassengerPendingForRouting(status: PassengerAssignmentStatus): boolean {
  return status === 'SCHEDULED' || status === 'EN_ROUTE' || status === 'ARRIVED';
}

