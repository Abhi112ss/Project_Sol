import crypto from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import {
  approvals,
  auditLogs,
  bookings,
  noShowRecords,
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  tripEvents,
  trips,
  tripStops,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';
import { deriveAssignmentOtp } from '../src/infrastructure/shared/otp.util.js';

describe('Phase 4 Driver Execution Engine & Offline Batch Sync (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;

  const driverHeaders = {
    'x-dev-user-id': SEED_IDS.userDriverRamesh,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DRIVER',
  };
  const approverHeaders = {
    'x-dev-user-id': SEED_IDS.userDutyApprover,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DUTY_APPROVER',
  };
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

  const createdBookingIds: string[] = [];
  const createdTripIds: string[] = [];

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
    if (createdTripIds.length > 0) {
      await dbService.db
        .delete(noShowRecords)
        .where(inArray(noShowRecords.tripId, createdTripIds));
      const paRows = await dbService.db
        .select({ id: passengerAssignments.id })
        .from(passengerAssignments)
        .where(inArray(passengerAssignments.tripId, createdTripIds));
      const paIds = paRows.map((p) => p.id);
      if (paIds.length > 0) {
        await dbService.db
          .delete(otpRecords)
          .where(inArray(otpRecords.passengerAssignmentId, paIds));
      }
      await dbService.db
        .delete(tripEvents)
        .where(inArray(tripEvents.tripId, createdTripIds));
      await dbService.db
        .delete(passengerAssignments)
        .where(inArray(passengerAssignments.tripId, createdTripIds));
      await dbService.db
        .delete(tripStops)
        .where(inArray(tripStops.tripId, createdTripIds));
      await dbService.db.delete(trips).where(inArray(trips.id, createdTripIds));
    }

    if (createdBookingIds.length > 0) {
      await dbService.db
        .delete(approvals)
        .where(inArray(approvals.bookingId, createdBookingIds));
      await dbService.db
        .delete(bookings)
        .where(inArray(bookings.id, createdBookingIds));
    }

    await dbService.db
      .delete(notifications)
      .where(
        inArray(notifications.recipientUserId, [
          SEED_IDS.userEmpAarav,
          SEED_IDS.userEmpPriya,
          SEED_IDS.userEmpKiran,
          SEED_IDS.userDriverRamesh,
        ]),
      );

    await dbService.db
      .delete(auditLogs)
      .where(
        inArray(auditLogs.actorUserId, [
          SEED_IDS.userDriverRamesh,
          SEED_IDS.userDutyApprover,
          SEED_IDS.userEmpPriya,
        ]),
      );

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await app.close();
  });

  it('executes 3-passenger trip (2 Picked Up w/ OTP, 1 Verified No-Show w/ Geofence+Wait Gate, Office Complete & Admin Appeal)', async () => {
    const futureDate = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    const pickupIso = new Date(Date.now() + 21 * 86_400_000).toISOString();

    // 1. Driver self profile
    const profRes = await request(app.getHttpServer())
      .get('/api/v1/driver/profile')
      .set(driverHeaders)
      .expect(200);
    expect(profRes.body.data.driver.id).toBe(SEED_IDS.driverRamesh);
    expect(profRes.body.data.assignedVehicle.id).toBe(SEED_IDS.vehicleDzire);

    // 2. Create, approve & dispatch 3 bookings (Aarav, Priya, Kiran)
    const pairs = [
      { emp: SEED_IDS.empAarav, loc: SEED_IDS.locKukatpally, lat: 17.4849, lng: 78.4138 },
      { emp: SEED_IDS.empPriya, loc: SEED_IDS.locMiyapur, lat: 17.4968, lng: 78.3614 },
      { emp: SEED_IDS.empKiran, loc: SEED_IDS.locAmeerpet, lat: 17.4375, lng: 78.4483 },
    ];

    const tripBookingIds: string[] = [];
    for (const p of pairs) {
      const bRes = await request(app.getHttpServer())
        .post('/api/v1/admin/bookings')
        .set(approverHeaders)
        .send({
          employeeId: p.emp,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: p.loc,
          travelDate: futureDate,
          direction: 'LOGIN',
          scheduledPickupAt: pickupIso,
        })
        .expect(201);
      const id = bRes.body.data.id as string;
      tripBookingIds.push(id);
      createdBookingIds.push(id);
    }

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: tripBookingIds, decision: 'APPROVED' })
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: futureDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: pickupIso,
        stops: tripBookingIds.map((bookingId, idx) => ({
          bookingId,
          sequenceNo: idx + 1,
          scheduledArrivalAt: pickupIso,
        })),
      })
      .expect(201);

    const tripId = dispatchRes.body.data.trip.id as string;
    createdTripIds.push(tripId);

    // 3. Driver lists trips & loads manifest
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/driver/trips')
      .set(driverHeaders)
      .expect(200);
    expect((listRes.body.data as Array<{ id: string }>).some((t) => t.id === tripId)).toBe(true);

    const manifestRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/trips/${tripId}`)
      .set(driverHeaders)
      .expect(200);
    const stops = manifestRes.body.data.stops as Array<{
      id: string;
      sequenceNo: number;
      stopType: string;
      navigationUrl: string;
      passengers: Array<{ id: string }>;
    }>;
    expect(stops).toHaveLength(4);
    expect(manifestRes.body.data.nextPendingStop.sequenceNo).toBe(1);
    expect(stops[0].navigationUrl).toContain('google.com/maps/dir/?api=1&destination=');

    // 4. Accept & Start trip
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/accept`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);

    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);
    expect(startRes.body.data.trip.status).toBe('IN_PROGRESS');
    expect(startRes.body.data.nextPendingStop.sequenceNo).toBe(1);

    // 5. Stop #1 (Aarav) — arrive inside geofence, test wrong OTP 422, then valid OTP -> BOARDED + advances to Stop #2
    const stop1 = stops[0];
    const pa1Id = stop1.passengers[0].id;
    const arrive1Res = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1.id}/arrive`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: pairs[0].lat, longitude: pairs[0].lng, accuracyM: 6 })
      .expect(201);
    expect(arrive1Res.body.data.geofenceVerified).toBe(true);
    expect(arrive1Res.body.data.distanceFromStopM).toBeLessThan(10);

    const wrongOtpRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1.id}/passengers/${pa1Id}/pickup`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: '0000' })
      .expect(422);
    expect(wrongOtpRes.body.error.code).toBe('INVALID_BOARDING_OTP');

    const aaravOtp = deriveAssignmentOtp(SEED_IDS.orgAcme, pa1Id, 'BOARDING');
    const pickup1Res = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1.id}/passengers/${pa1Id}/pickup`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: aaravOtp, latitude: pairs[0].lat, longitude: pairs[0].lng })
      .expect(201);
    expect(pickup1Res.body.data.assignment.status).toBe('BOARDED');
    expect(pickup1Res.body.data.nextPendingStop.sequenceNo).toBe(2);

    // 6. Stop #2 (Priya) — arrive inside geofence, test Wait Timer 422 + Geofence 422, then valid NO_SHOW
    const stop2 = stops[1];
    const pa2Id = stop2.passengers[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/arrive`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: pairs[1].lat, longitude: pairs[1].lng, accuracyM: 5 })
      .expect(201);

    const farNoShowRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/passengers/${pa2Id}/no-show`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        reasonCode: 'PASSENGER_UNREACHABLE',
        latitude: 17.4239,
        longitude: 78.3489,
      })
      .expect(422);
    expect(farNoShowRes.body.error.code).toBe('NO_SHOW_GEOFENCE_OUT_OF_RANGE');

    const earlyNoShowRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/passengers/${pa2Id}/no-show`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        reasonCode: 'PASSENGER_UNREACHABLE',
        latitude: pairs[1].lat,
        longitude: pairs[1].lng,
      })
      .expect(422);
    expect(earlyNoShowRes.body.error.code).toBe('NO_SHOW_WAIT_TIMER_NOT_ELAPSED');

    // Backdate arrival by 360 seconds (6m) in Postgres to satisfy org 300s wait window cleanly
    await dbService.db
      .update(passengerAssignments)
      .set({ driverArrivedAt: new Date(Date.now() - 360_000) })
      .where(eq(passengerAssignments.id, pa2Id));

    const validNoShowRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/passengers/${pa2Id}/no-show`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        reasonCode: 'PASSENGER_UNREACHABLE',
        notes: 'Called twice, phone switched off',
        latitude: pairs[1].lat,
        longitude: pairs[1].lng,
        accuracyM: 8,
      })
      .expect(201);
    expect(validNoShowRes.body.data.assignment.status).toBe('NO_SHOW');
    expect(validNoShowRes.body.data.noShowRecord.geofenceVerified).toBe(true);
    expect(validNoShowRes.body.data.nextPendingStop.sequenceNo).toBe(3);

    const noShowId = validNoShowRes.body.data.noShowRecord.id as string;

    // 7. Employee Priya appeals NO_SHOW & Admin resolves as OVERTURNED
    const appealRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/trips/${tripId}/appeal-no-show`)
      .set({ ...priyaHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ appealNote: 'Was waiting inside apartment gate due to rain.' })
      .expect(201);
    expect(appealRes.body.data.appealStatus).toBe('APPEALED');

    const adminQueueRes = await request(app.getHttpServer())
      .get('/api/v1/admin/no-shows?appealStatus=APPEALED')
      .set(approverHeaders)
      .expect(200);
    expect(
      (adminQueueRes.body.data as Array<{ id: string }>).some((r) => r.id === noShowId),
    ).toBe(true);

    const resolveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/no-shows/${noShowId}/resolve-appeal`)
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ decision: 'OVERTURNED', resolutionNote: 'Verified gate CCTV entry.' })
      .expect(201);
    expect(resolveRes.body.data.appealStatus).toBe('OVERTURNED');

    // 8. Stop #3 (Kiran) — arrive & pickup -> auto-progresses to OFFICE Stop #4
    const stop3 = stops[2];
    const pa3Id = stop3.passengers[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop3.id}/arrive`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: pairs[2].lat, longitude: pairs[2].lng })
      .expect(201);

    const kiranOtp = deriveAssignmentOtp(SEED_IDS.orgAcme, pa3Id, 'BOARDING');
    const pickup3Res = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop3.id}/passengers/${pa3Id}/pickup`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: kiranOtp })
      .expect(201);
    expect(pickup3Res.body.data.nextPendingStop.stopType).toBe('OFFICE');
    expect(pickup3Res.body.data.nextPendingStop.sequenceNo).toBe(4);

    // 9. Complete trip at Gachibowli Campus
    const completeRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/complete`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: 17.4239, longitude: 78.3489 })
      .expect(201);
    expect(completeRes.body.data.status).toBe('COMPLETED');
  });

  it('replays queued offline events chronologically and deduplicates retries by clientEventId', async () => {
    const offlineDate = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);
    const offlineIso = new Date(Date.now() + 25 * 86_400_000).toISOString();

    const bRes = await request(app.getHttpServer())
      .post('/api/v1/admin/bookings')
      .set(approverHeaders)
      .send({
        employeeId: SEED_IDS.empAarav,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locKukatpally,
        travelDate: offlineDate,
        direction: 'LOGIN',
        scheduledPickupAt: offlineIso,
      })
      .expect(201);
    const bookingId = bRes.body.data.id as string;
    createdBookingIds.push(bookingId);

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: [bookingId], decision: 'APPROVED' })
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: offlineDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: offlineIso,
        stops: [{ bookingId, sequenceNo: 1, scheduledArrivalAt: offlineIso }],
      })
      .expect(201);

    const tripId = dispatchRes.body.data.trip.id as string;
    createdTripIds.push(tripId);

    const stopId = dispatchRes.body.data.stops[0].id as string;
    const empDetailRes = await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${tripId}`)
      .set(aaravHeaders)
      .expect(200);
    const paId = empDetailRes.body.data.yourAssignment.id as string;
    const aaravOtp = empDetailRes.body.data.boardingOtp as string;

    const nowMs = Date.now();
    const events = [
      {
        clientEventId: crypto.randomUUID(),
        eventType: 'TRIP_START',
        occurredAtClient: new Date(nowMs - 600_000).toISOString(),
      },
      {
        clientEventId: crypto.randomUUID(),
        eventType: 'STOP_ARRIVE',
        stopId,
        latitude: 17.4849,
        longitude: 78.4138,
        occurredAtClient: new Date(nowMs - 300_000).toISOString(),
      },
      {
        clientEventId: crypto.randomUUID(),
        eventType: 'PASSENGER_PICKUP',
        stopId,
        assignmentId: paId,
        otpCode: aaravOtp,
        occurredAtClient: new Date(nowMs - 180_000).toISOString(),
      },
      {
        clientEventId: crypto.randomUUID(),
        eventType: 'TRIP_COMPLETE',
        latitude: 17.4239,
        longitude: 78.3489,
        occurredAtClient: new Date(nowMs - 30_000).toISOString(),
      },
    ];

    // Send offline batch in scrambled order — backend sorts chronologically
    const firstBatch = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/events`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ events: [events[3], events[1], events[0], events[2]] })
      .expect(201);
    expect(firstBatch.body.data.processedCount).toBe(4);
    expect(firstBatch.body.data.skippedDuplicateCount).toBe(0);
    expect(firstBatch.body.data.manifest.trip.status).toBe('COMPLETED');

    // Re-send same clientEventIds (with a new X-Idempotency-Key) — skipped safely without duplicates
    const retryBatch = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/events`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ events })
      .expect(201);
    expect(retryBatch.body.data.processedCount).toBe(0);
    expect(retryBatch.body.data.skippedDuplicateCount).toBe(4);
  });
});
