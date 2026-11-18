export const TRANSPORT_TOPICS = {
  TRIP_EVENTS: 'transport.trip.events',
  STOP_EVENTS: 'transport.stop.events',
  PASSENGER_EVENTS: 'transport.passenger.events',
  DRIVER_LOCATION: 'transport.driver.location',
  NOTIFICATION_EVENTS: 'transport.notification.events',
  SAFETY_EVENTS: 'transport.safety.events',
  ASSIGNMENT_EVENTS: 'transport.assignment.events',
} as const;

export type TransportTopic = (typeof TRANSPORT_TOPICS)[keyof typeof TRANSPORT_TOPICS];

