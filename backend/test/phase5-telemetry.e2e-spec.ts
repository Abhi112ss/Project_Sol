import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
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
  drivers,
  gpsLocations,
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  tripEvents,
  trips,
  tripStops,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

describe('Phase 5 Real-Time Fleet Telemetry, Monotonic Redis Guard & Live Map API (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;
  let redisService: RedisService;
  let wsPort: number;

  const approverHeaders = {
    'x-dev-user-id': SEED_IDS.userDutyApprover,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DUTY_APPROVER',
  };
  const managerHeaders = {
    'x-dev-user-id': SEED_IDS.userTransportManager,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'TRANSPORT_MANAGER',
  };
  const driverHeaders = {
    'x-dev-user-id': SEED_IDS.userDriverRamesh,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DRIVER',
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
  const kiranHeaders = {
    'x-dev-user-id': SEED_IDS.userEmpKiran,
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
    await app.listen(0);
    const addr = app.getHttpServer().address() as AddressInfo;
    wsPort = addr.port;
    dbService = app.get(DatabaseService);
    redisService = app.get(RedisService);
  });

  afterAll(async () => {
    for (const tid of createdTripIds) {
      await redisService.clearTripLiveState(tid, SEED_IDS.driverRamesh);
    }

    if (createdTripIds.length > 0) {
      await dbService.db
        .delete(gpsLocations)
        .where(inArray(gpsLocations.tripId, createdTripIds));
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
          SEED_IDS.userDriverRamesh,
        ]),
      );

    await dbService.db
      .delete(auditLogs)
      .where(
        inArray(auditLogs.actorUserId, [
          SEED_IDS.userDriverRamesh,
          SEED_IDS.userDutyApprover,
        ]),
      );

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await dbService.db
      .update(drivers)
      .set({ availabilityStatus: 'AVAILABLE' })
      .where(eq(drivers.id, SEED_IDS.driverRamesh));

    await app.close();
  });

  it('ingests single + batch GPS pings, prevents old replay overwriting newer Redis fix, broadcasts over /ws/transport, and enforces privacy boundaries', async () => {
    const futureDate = new Date(Date.now() + 24 * 86_400_000).toISOString().slice(0, 10);
    const pickupIso = new Date(Date.now() + 24 * 86_400_000).toISOString();

    // 1. Create & approve 2 bookings (Aarav, Priya) and dispatch to Ramesh
    const createdBookings: Array<{ bookingId: string; lat: number; lng: number }> = [];
    for (const pair of [
      { emp: SEED_IDS.empAarav, loc: SEED_IDS.locKukatpally, lat: 17.4849, lng: 78.4138 },
      { emp: SEED_IDS.empPriya, loc: SEED_IDS.locMiyapur, lat: 17.4968, lng: 78.3614 },
    ]) {
      const bRes = await request(app.getHttpServer())
        .post('/api/v1/admin/bookings')
        .set(approverHeaders)
        .set('x-idempotency-key', crypto.randomUUID())
        .send({
          employeeId: pair.emp,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: pair.loc,
          travelDate: futureDate,
          direction: 'LOGIN',
          scheduledPickupAt: pickupIso,
        })
        .expect(201);
      createdBookingIds.push(bRes.body.data.id);
      createdBookings.push({ bookingId: bRes.body.data.id, lat: pair.lat, lng: pair.lng });
    }

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set(approverHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .send({
        bookingIds: createdBookings.map((b) => b.bookingId),
        decision: 'APPROVED',
      })
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set(approverHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .send({
        officeId: SEED_IDS.officeGachibowli,
        shiftId: SEED_IDS.shiftMorningLogin,
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        travelDate: futureDate,
        direction: 'LOGIN',
        plannedStartAt: pickupIso,
        stops: createdBookings.map((b, idx) => ({
          bookingId: b.bookingId,
          sequenceNo: idx + 1,
          scheduledArrivalAt: pickupIso,
        })),
      })
      .expect(201);

    const tripId = dispatchRes.body.data.trip.id as string;
    createdTripIds.push(tripId);

    // 2. Reject GPS ingestion before trip is started (ASSIGNED)
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/location`)
      .set(driverHeaders)
      .send({
        latitude: 17.475,
        longitude: 78.401,
        accuracyM: 12,
      })
      .expect(409);

    // 3. Accept & start trip
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/accept`)
      .set(driverHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set(driverHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .expect(201);

    // 4. Verify honest null telemetry before any GPS ping arrives
    const preLive = await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${tripId}/live`)
      .set(aaravHeaders)
      .expect(200);
    expect(preLive.body.data.gpsTelemetry).toBeNull();
    expect(preLive.body.data.connectionStatus).toBe('NO_SIGNAL');

    // 5. Connect WebSocket client (Engine.IO v4) to /ws/transport & join trip room
    const wsUrl = `ws://127.0.0.1:${wsPort}/socket.io/?EIO=4&transport=websocket`;
    const receivedWsEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS handshake timed out')), 5000);
      ws.addEventListener('open', () => {
        // Wait for Engine.IO '0' frame
      });
      ws.addEventListener('message', (msg) => {
        const packet = String(msg.data);
        if (packet.startsWith('0')) {
          ws.send('40/ws/transport,');
          return;
        }
        if (packet.startsWith('40/ws/transport')) {
          ws.send(
            `42/ws/transport,${JSON.stringify([
              'join',
              {
                organizationId: SEED_IDS.orgAcme,
                employeeId: SEED_IDS.empAarav,
                tripId,
              },
            ])}`,
          );
          setTimeout(() => {
            clearTimeout(timeout);
            resolve();
          }, 150);
          return;
        }
        if (packet === '2') {
          ws.send('3');
          return;
        }
        if (packet.startsWith('42/ws/transport,')) {
          try {
            const parsed = JSON.parse(packet.slice('42/ws/transport,'.length)) as [
              string,
              Record<string, unknown>,
            ];
            receivedWsEvents.push({ event: parsed[0], data: parsed[1] });
          } catch {
            // ignore non-json
          }
        }
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // 6. Reject Null Island (0,0) validation
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/location`)
      .set(driverHeaders)
      .send({ latitude: 0, longitude: 0, accuracyM: 10 })
      .expect(400);

    // 7. Send fresh live location ping at t_new = now - 3s
    const newerIso = new Date(Date.now() - 3_000).toISOString();
    const freshPingId = crypto.randomUUID();
    const liveRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/location`)
      .set(driverHeaders)
      .send({
        clientPingId: freshPingId,
        latitude: 17.4801,
        longitude: 78.4102,
        accuracyM: 9.5,
        speedMps: 11.2,
        headingDeg: 145,
        altitudeM: 548,
        sequenceNo: 20,
        recordedAt: newerIso,
      })
      .expect(201);

    expect(liveRes.body.data.insertedCount).toBe(1);
    expect(liveRes.body.data.redisUpdated).toBe(true);
    expect(liveRes.body.data.latest.latitude).toBeCloseTo(17.4801, 4);

    // Confirm WebSocket broadcast reached room
    await new Promise((r) => setTimeout(r, 150));
    const wsLocEvent = receivedWsEvents.find(
      (e) =>
        (e.event === 'trip.location.updated' || e.event === 'vehicle.location') &&
        e.data.tripId === tripId,
    );
    expect(wsLocEvent).toBeDefined();
    expect(wsLocEvent?.data.latitude).toBeCloseTo(17.4801, 4);

    ws.close();

    // 8. Offline older batch replay + duplicate freshPingId:
    // Must store older breadcrumb in Postgres WITHOUT overwriting newer Redis live position!
    const olderIso = new Date(Date.now() - 45_000).toISOString();
    const olderPingId = crypto.randomUUID();
    const batchRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/locations/batch`)
      .set(driverHeaders)
      .send({
        samples: [
          {
            clientPingId: olderPingId,
            latitude: 17.4699,
            longitude: 78.3999,
            accuracyM: 14,
            speedMps: 9.0,
            headingDeg: 90,
            sequenceNo: 10,
            recordedAt: olderIso,
          },
          {
            clientPingId: freshPingId, // duplicate idempotency check
            latitude: 17.4801,
            longitude: 78.4102,
            accuracyM: 9.5,
            speedMps: 11.2,
            headingDeg: 145,
            sequenceNo: 20,
            recordedAt: newerIso,
          },
        ],
      })
      .expect(201);

    expect(batchRes.body.data.acceptedCount).toBe(2);
    expect(batchRes.body.data.insertedCount).toBe(1);
    expect(batchRes.body.data.duplicatesIgnored).toBe(1);
    expect(batchRes.body.data.redisUpdated).toBe(false);
    // Redis snapshot MUST STILL be 17.4801 (never rolled back to 17.4699!)
    expect(batchRes.body.data.latest.latitude).toBeCloseTo(17.4801, 4);

    // 9. Admin live fleet console snapshot & chronological breadcrumbs
    const fleetRes = await request(app.getHttpServer())
      .get('/api/v1/admin/fleet/live')
      .set(managerHeaders)
      .expect(200);
    expect(fleetRes.body.data.summary.liveCount).toBeGreaterThanOrEqual(1);
    const liveItem = (
      fleetRes.body.data.items as Array<{
        id: string;
        health: string;
        gpsTelemetry: { latitude: number; headingDeg: number; isStale: boolean };
      }>
    ).find((x) => x.id === tripId);
    expect(liveItem).toBeDefined();
    expect(liveItem?.health).toBe('LIVE');
    expect(liveItem?.gpsTelemetry.latitude).toBeCloseTo(17.4801, 4);
    expect(liveItem?.gpsTelemetry.headingDeg).toBe(145);
    expect(liveItem?.gpsTelemetry.isStale).toBe(false);

    const trailRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/trips/${tripId}/locations`)
      .set(managerHeaders)
      .expect(200);
    expect(trailRes.body.data.points).toHaveLength(2);
    expect(trailRes.body.data.points[0].latitude).toBeCloseTo(17.4699, 4);
    expect(trailRes.body.data.points[1].latitude).toBeCloseTo(17.4801, 4);

    // 10. Employee live telemetry & trip detail privacy check
    const empLive = await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${tripId}/live`)
      .set(aaravHeaders)
      .expect(200);
    expect(empLive.body.data.connectionStatus).toBe('LIVE');
    expect(empLive.body.data.gpsTelemetry.latitude).toBeCloseTo(17.4801, 4);
    expect(empLive.body.data.gpsTelemetry.etaMinutes).toBeGreaterThanOrEqual(1);

    const empDetail = await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${tripId}`)
      .set(priyaHeaders)
      .expect(200);
    expect(empDetail.body.data.gpsTelemetry.latitude).toBeCloseTo(17.4801, 4);
    // Co-passenger privacy: Priya must not see Aarav's stop coordinates
    const stop1 = empDetail.body.data.stops.find((s: { sequenceNo: number }) => s.sequenceNo === 1);
    expect(stop1.latitude).toBeNull();

    // Kiran (not on this trip) must get 404
    await request(app.getHttpServer())
      .get(`/api/v1/employee/trips/${tripId}/live`)
      .set(kiranHeaders)
      .expect(404);
  });
});
