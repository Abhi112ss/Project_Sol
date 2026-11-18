import crypto from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import {
  approvals,
  auditLogs,
  bookings,
  employeeLocations,
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  safetyAlerts,
  tripEvents,
  trips,
  tripStops,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';
import { hashOtpCode, verifyOtpCode } from '../src/infrastructure/shared/otp.util.js';

describe('Phase 3 Employee API & Dispatch Execution Transparency (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;

  const aaravHeaders = {
    'x-dev-user-id': SEED_IDS.userEmpAarav,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'EMPLOYEE',
  };
  const priyaHeaders = {
    'x-dev-user-id': SEED_IDS.userEmpPriya,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'EMPLOYEE',
  };
  const approverHeaders = {
    'x-dev-user-id': SEED_IDS.userDutyApprover,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DUTY_APPROVER',
  };

  let origEmergencyName: string | null = null;
  let origEmergencyPhone: string | null = null;
  let createdLocationId: string | null = null;
  const createdBookingIds: string[] = [];
  let createdTripId: string | null = null;
  let createdSosAlertId: string | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dbService = app.get(DatabaseService);
  });

  afterAll(async () => {
    if (origEmergencyName !== null || origEmergencyPhone !== null) {
      await request(app.getHttpServer())
        .patch('/api/v1/employee/profile')
        .set(aaravHeaders)
        .send({
          emergencyContactName: origEmergencyName,
          emergencyContactPhone: origEmergencyPhone,
        });
    }

    if (createdSosAlertId) {
      await dbService.db.delete(safetyAlerts).where(eq(safetyAlerts.id, createdSosAlertId));
    }

    if (createdTripId) {
      const paRows = await dbService.db
        .select({ id: passengerAssignments.id })
        .from(passengerAssignments)
        .where(eq(passengerAssignments.tripId, createdTripId));
      const paIds = paRows.map((p) => p.id);
      if (paIds.length > 0) {
        await dbService.db
          .delete(otpRecords)
          .where(inArray(otpRecords.passengerAssignmentId, paIds));
      }
      await dbService.db.delete(tripEvents).where(eq(tripEvents.tripId, createdTripId));
      await dbService.db
        .delete(passengerAssignments)
        .where(eq(passengerAssignments.tripId, createdTripId));
      await dbService.db.delete(tripStops).where(eq(tripStops.tripId, createdTripId));
      await dbService.db.delete(trips).where(eq(trips.id, createdTripId));
    }

    if (createdBookingIds.length > 0) {
      await dbService.db.delete(approvals).where(inArray(approvals.bookingId, createdBookingIds));
      await dbService.db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
    }

    if (createdLocationId) {
      await dbService.db
        .delete(employeeLocations)
        .where(eq(employeeLocations.id, createdLocationId));
    }

    await dbService.db
      .delete(notifications)
      .where(
        inArray(notifications.recipientUserId, [
          SEED_IDS.userEmpAarav,
          SEED_IDS.userEmpPriya,
          SEED_IDS.userDriverRamesh,
        ]),
      );

    await dbService.db
      .delete(auditLogs)
      .where(
        inArray(auditLogs.actorUserId, [
          SEED_IDS.userEmpAarav,
          SEED_IDS.userEmpPriya,
          SEED_IDS.userDutyApprover,
        ]),
      );

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await app.close();
  });

  it('executes self-service profile, locations, booking cutoff, privacy-safe pickup timeline, OTP hashing, running-late, safe-reach, SOS & cannot-board cancellation', async () => {
    // 1. Profile & emergency contact update
    const profileRes = await request(app.getHttpServer())
      .get('/api/v1/employee/profile')
      .set(aaravHeaders)
      .expect(200);

    expect(profileRes.body.data.employee.id).toBe(SEED_IDS.empAarav);
    expect(profileRes.body.data.availableOffices.length).toBeGreaterThanOrEqual(1);
    expect(profileRes.body.data.availableShifts.length).toBeGreaterThanOrEqual(1);

    origEmergencyName = (profileRes.body.data.employee.emergencyContactName as string | null) ?? null;
    origEmergencyPhone =
      (profileRes.body.data.employee.emergencyContactPhone as string | null) ?? null;

    const patchProfileRes = await request(app.getHttpServer())
      .patch('/api/v1/employee/profile')
      .set(aaravHeaders)
      .send({
        emergencyContactName: 'Meera Nair (E2E)',
        emergencyContactPhone: '+91-9888877777',
      })
      .expect(200);
    expect(patchProfileRes.body.data.employee.emergencyContactName).toBe('Meera Nair (E2E)');

    // 2. Saved pickup locations CRUD
    const locsRes = await request(app.getHttpServer())
      .get('/api/v1/employee/locations')
      .set(aaravHeaders)
      .expect(200);
    expect(locsRes.body.data.length).toBeGreaterThanOrEqual(1);

    const addLocRes = await request(app.getHttpServer())
      .post('/api/v1/employee/locations')
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        locationName: 'Kondapur Gate B (E2E)',
        address: 'Kondapur Main Road, Hyderabad 500084',
        corridorTag: 'Kondapur',
        latitude: 17.4631,
        longitude: 78.3574,
        geofenceRadiusM: 120,
        isDefault: false,
      })
      .expect(201);

    createdLocationId = addLocRes.body.data.id as string;
    expect(addLocRes.body.data.isDefault).toBe(false);

    const patchLocRes = await request(app.getHttpServer())
      .patch(`/api/v1/employee/locations/${createdLocationId}`)
      .set(aaravHeaders)
      .send({ corridorTag: 'Kondapur West' })
      .expect(200);
    expect(patchLocRes.body.data.corridorTag).toBe('Kondapur West');

    // 3. Booking cutoff violation (+20 min fails 60m cutoff with 422 BOOKING_CUTOFF_PASSED)
    const futureTripDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const insideCutoffIso = new Date(Date.now() + 20 * 60_000).toISOString();

    const tooLateRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locKukatpally,
        travelDate: futureTripDate,
        direction: 'LOGIN',
        scheduledPickupAt: insideCutoffIso,
      })
      .expect(422);
    expect(tooLateRes.body.error.code).toBe('BOOKING_CUTOFF_PASSED');

    // 4. Valid bookings for Aarav & Priya (+14 days outside cutoff)
    const validPickupIso = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const aaravBookingRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: createdLocationId,
        travelDate: futureTripDate,
        direction: 'LOGIN',
        scheduledPickupAt: validPickupIso,
        notes: 'Near east pillar',
      })
      .expect(201);
    const aaravBookingId = aaravBookingRes.body.data.id as string;
    createdBookingIds.push(aaravBookingId);
    expect(aaravBookingRes.body.data.status).toBe('PENDING_APPROVAL');

    const priyaBookingRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set({ ...priyaHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locMiyapur,
        travelDate: futureTripDate,
        direction: 'LOGIN',
        scheduledPickupAt: validPickupIso,
      })
      .expect(201);
    const priyaBookingId = priyaBookingRes.body.data.id as string;
    createdBookingIds.push(priyaBookingId);

    // 5. Duty approver approves & manual dispatch allocates Priya (#1) + Aarav (#2)
    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        bookingIds: [priyaBookingId, aaravBookingId],
        decision: 'APPROVED',
        remarks: 'Phase 3 E2E approved batch',
      })
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: futureTripDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: validPickupIso,
        stops: [
          { bookingId: priyaBookingId, sequenceNo: 1, scheduledArrivalAt: validPickupIso },
          { bookingId: aaravBookingId, sequenceNo: 2, scheduledArrivalAt: validPickupIso },
        ],
      })
      .expect(201);
    createdTripId = dispatchRes.body.data.trip.id as string;

    // 6. Verify upcoming trip transparency, masked co-passenger privacy, null GPS & hashed OTP
    const upcomingRes = await request(app.getHttpServer())
      .get('/api/v1/employee/trips/upcoming')
      .set(aaravHeaders)
      .expect(200);

    const upcoming = upcomingRes.body.data as {
      trip: { id: string; tripCode: string };
      yourAssignment: { id: string };
      yourStopSequence: number;
      boardingOtp: string | null;
      passengersTotal: number;
      gpsTelemetry: unknown;
      stops: Array<{
        sequenceNo: number;
        stopType: string;
        locationName: string;
        latitude: number | null;
        isYourStop: boolean;
      }>;
    };

    expect(upcoming.trip.id).toBe(createdTripId);
    expect(upcoming.yourStopSequence).toBe(2);
    expect(upcoming.passengersTotal).toBe(2);
    expect(upcoming.gpsTelemetry).toBeNull();
    expect(upcoming.boardingOtp).toMatch(/^\d{4}$/);

    // Verify OTP row in PostgreSQL is hashed (never plaintext)
    const [otpRow] = await dbService.db
      .select()
      .from(otpRecords)
      .where(
        and(
          eq(otpRecords.passengerAssignmentId, upcoming.yourAssignment.id),
          eq(otpRecords.otpType, 'BOARDING'),
        ),
      )
      .limit(1);
    expect(otpRow).toBeDefined();
    expect(otpRow.otpCodeHash).not.toBe(upcoming.boardingOtp);
    expect(otpRow.otpCodeHash).toBe(hashOtpCode(SEED_IDS.orgAcme, upcoming.boardingOtp!));
    expect(verifyOtpCode(SEED_IDS.orgAcme, upcoming.boardingOtp!, otpRow.otpCodeHash)).toBe(true);

    // Co-passenger privacy: Stop #1 (Priya) masked, Stop #2 (Aarav) unmasked, Stop #3 (OFFICE) unmasked
    const stop1 = upcoming.stops.find((s) => s.sequenceNo === 1)!;
    const stop2 = upcoming.stops.find((s) => s.sequenceNo === 2)!;
    const officeStop = upcoming.stops.find((s) => s.stopType === 'OFFICE')!;
    expect(stop1.isYourStop).toBe(false);
    expect(stop1.locationName).toBe('Pickup Stop #1');
    expect(stop1.latitude).toBeNull();
    expect(stop2.isYourStop).toBe(true);
    expect(stop2.locationName).toBe('Kondapur Gate B (E2E)');
    expect(stop2.latitude).toBeCloseTo(17.4631, 4);
    expect(officeStop.latitude).not.toBeNull();

    // 7. Trips list + trip detail
    const tripsListRes = await request(app.getHttpServer())
      .get('/api/v1/employee/trips')
      .set(aaravHeaders)
      .expect(200);
    expect(
      (tripsListRes.body.data as Array<{ tripId: string }>).some((t) => t.tripId === createdTripId),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${createdTripId}`)
      .set(aaravHeaders)
      .expect(200);

    // 8. Running late & Safe Reach
    const lateRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/trips/${createdTripId}/running-late`)
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ etaMinutes: 9, note: 'Waiting for gate pass' })
      .expect(201);
    expect(lateRes.body.data.runningLateEtaMinutes).toBe(9);

    const safeReachRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/trips/${createdTripId}/safe-reach`)
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);
    expect(safeReachRes.body.data.safeReachConfirmedAt).toBeTruthy();

    // 9. SOS emergency trigger
    const sosRes = await request(app.getHttpServer())
      .post('/api/v1/employee/safety/sos')
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        tripId: createdTripId,
        latitude: 17.445,
        longitude: 78.37,
        accuracyM: 12,
        notes: 'Phase 3 E2E emergency drill',
      })
      .expect(201);
    createdSosAlertId = sosRes.body.data.id as string;
    expect(sosRes.body.data.alertType).toBe('SOS');
    expect(sosRes.body.data.severity).toBe('CRITICAL');
    expect(sosRes.body.data.status).toBe('OPEN');

    // 10. Notifications feed & mark read
    const notifRes = await request(app.getHttpServer())
      .get('/api/v1/employee/notifications')
      .set(aaravHeaders)
      .expect(200);
    const notifItems = notifRes.body.data as Array<{ id: string; readAt: string | null }>;
    expect(notifItems.length).toBeGreaterThanOrEqual(1);

    const readRes = await request(app.getHttpServer())
      .patch(`/api/v1/employee/notifications/${notifItems[0].id}/read`)
      .set(aaravHeaders)
      .expect(200);
    expect(readRes.body.data.readAt).toBeTruthy();

    // 11. Cancellation cutoff check (admin booking +15m inside 45m cutoff -> employee cancel returns 422)
    const urgentIso = new Date(Date.now() + 15 * 60_000).toISOString();
    const urgentBookingRes = await request(app.getHttpServer())
      .post('/api/v1/admin/bookings')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        employeeId: SEED_IDS.empAarav,
        shiftId: SEED_IDS.shiftEveningLogout,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locKukatpally,
        travelDate: futureTripDate,
        direction: 'LOGOUT',
        scheduledPickupAt: urgentIso,
      })
      .expect(201);
    createdBookingIds.push(urgentBookingRes.body.data.id as string);

    const cancelCutoffRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/bookings/${urgentBookingRes.body.data.id}/cancel`)
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ reason: 'Testing cutoff enforcement' })
      .expect(422);
    expect(cancelCutoffRes.body.error.code).toBe('BOOKING_CUTOFF_PASSED');

    // 12. Dispatched "Cannot Board" cancel (Priya +14d outside cutoff) -> cancels booking + passenger assignment + notifies driver
    const cancelPriyaRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/bookings/${priyaBookingId}/cancel`)
      .set({ ...priyaHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ reason: 'Unexpected medical appointment' })
      .expect(201);
    expect(cancelPriyaRes.body.data.status).toBe('CANCELLED');

    const [priyaAssignment] = await dbService.db
      .select()
      .from(passengerAssignments)
      .where(eq(passengerAssignments.bookingId, priyaBookingId))
      .limit(1);
    expect(priyaAssignment.status).toBe('CANCELLED');

    const driverNotifs = await dbService.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, SEED_IDS.userDriverRamesh),
          eq(notifications.category, 'PASSENGER_CANCELLED'),
        ),
      );
    expect(driverNotifs.length).toBeGreaterThanOrEqual(1);
  });
});

