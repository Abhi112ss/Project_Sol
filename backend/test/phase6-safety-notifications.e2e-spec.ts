import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
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
  drivers,
  gpsLocations,
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
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

describe('Phase 6 Notifications, BullMQ Reminders & Safety Escalations (E2E)', () => {
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
        .delete(safetyAlerts)
        .where(inArray(safetyAlerts.tripId, createdTripIds));
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
          SEED_IDS.userOrgAdmin,
          SEED_IDS.userTransportManager,
        ]),
      );

    await dbService.db
      .delete(auditLogs)
      .where(eq(auditLogs.organizationId, SEED_IDS.orgAcme));

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await dbService.db
      .update(drivers)
      .set({ availabilityStatus: 'AVAILABLE' })
      .where(eq(drivers.id, SEED_IDS.driverRamesh));

    await app.close();
  });

  it('delivers BullMQ push notifications, delay events, route deviation & safe-reach escalations, and SOS acknowledge/resolve workflow', async () => {
    // 1. Register push tokens for employee and driver
    await request(app.getHttpServer())
      .post('/api/v1/employee/notifications/device-token')
      .set(aaravHeaders)
      .send({ token: 'fcm-aarav-phase6-token', platform: 'ANDROID' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/driver/notifications/device-token')
      .set(driverHeaders)
      .send({ token: 'fcm-driver-phase6-token', platform: 'ANDROID' })
      .expect(201);

    // 2. Create 2 future bookings (31 days ahead to isolate from parallel test runs)
    const futureDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const travelDate = futureDate.toISOString().slice(0, 10);
    const stop1SchedIso = new Date(Date.now() - 12 * 60 * 1000).toISOString(); // 12m in past -> triggers driver delay > 120s
    const stop2SchedIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const b1 = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set(aaravHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locKukatpally,
        travelDate,
        direction: 'LOGIN',
        scheduledPickupAt: futureDate.toISOString(),
      })
      .expect(201);
    createdBookingIds.push(b1.body.data.id as string);

    const b2 = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set(priyaHeaders)
      .set('x-idempotency-key', crypto.randomUUID())
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locMiyapur,
        travelDate,
        direction: 'LOGIN',
        scheduledPickupAt: futureDate.toISOString(),
      })
      .expect(201);
    createdBookingIds.push(b2.body.data.id as string);

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set(approverHeaders)
      .send({ bookingIds: createdBookingIds, decision: 'APPROVED' })
      .expect(201);

    // 3. Dispatch 2-stop trip
    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set(managerHeaders)
      .send({
        travelDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        stops: [
          {
            bookingId: createdBookingIds[0],
            sequenceNo: 1,
            scheduledArrivalAt: stop1SchedIso,
          },
          {
            bookingId: createdBookingIds[1],
            sequenceNo: 2,
            scheduledArrivalAt: stop2SchedIso,
          },
        ],
      })
      .expect(201);

    const tripId = dispatchRes.body.data.trip.id as string;
    const stop1Id = dispatchRes.body.data.stops[0].id as string;
    const pa1Id = dispatchRes.body.data.assignments[0].id as string;
    createdTripIds.push(tripId);

    // Connect WebSocket client on orgOps + trip room
    const wsEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const ws = new WebSocket(
      `ws://127.0.0.1:${wsPort}/socket.io/?EIO=4&transport=websocket&organizationId=${SEED_IDS.orgAcme}`,
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
      ws.addEventListener('message', (ev) => {
        const packet = String(ev.data);
        if (packet.startsWith('0')) {
          ws.send('40/ws/transport,');
          return;
        }
        if (packet.startsWith('40/ws/transport')) {
          ws.send(
            `42/ws/transport,${JSON.stringify(['join', { organizationId: SEED_IDS.orgAcme, tripId }])}`,
          );
          clearTimeout(timeout);
          resolve();
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
            wsEvents.push({ event: parsed[0], data: parsed[1] });
          } catch {
            // ignore
          }
        }
      });
    });

    // Accept & start trip
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/accept`)
      .set(driverHeaders)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set(driverHeaders)
      .send({ latitude: 17.4849, longitude: 78.4138 })
      .expect(201);

    // Driver checks notifications -> received TRIP_DISPATCHED alert
    const drvNotifs = await request(app.getHttpServer())
      .get('/api/v1/driver/notifications')
      .set(driverHeaders)
      .expect(200);
    expect(
      (drvNotifs.body.data as Array<{ category: string }>).some(
        (n) => n.category === 'TRIP_DISPATCHED',
      ),
    ).toBe(true);

    // 4. Late arrive at stop 1 -> emits trip.delayed + creates DRIVER_DELAYED alert for stop 2 rider (Priya)
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1Id}/arrive`)
      .set(driverHeaders)
      .send({ latitude: 17.4849, longitude: 78.4138, accuracyM: 12 })
      .expect(201);

    let hasDelayWs = false;
    let hasDriverDelayedNotif = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      hasDelayWs = wsEvents.some((e) => e.event === 'trip.delayed' && e.data.tripId === tripId);
      const priyaNotifs = await request(app.getHttpServer())
        .get('/api/v1/employee/notifications')
        .set(priyaHeaders)
        .expect(200);
      hasDriverDelayedNotif = (priyaNotifs.body.data as Array<{ category: string }>).some(
        (n) => n.category === 'DRIVER_DELAYED',
      );
      if (hasDelayWs && hasDriverDelayedNotif) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    expect(hasDelayWs).toBe(true);
    expect(hasDriverDelayedNotif).toBe(true);

    // 5. Telemetry ping > 5km off assigned corridor -> triggers automated ROUTE_DEVIATION alert
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/location`)
      .set(driverHeaders)
      .send({
        clientPingId: crypto.randomUUID(),
        latitude: 17.445,
        longitude: 78.51,
        accuracyM: 10,
        speedMps: 12,
        headingDeg: 90,
        sequenceNo: 1,
        recordedAt: new Date(Date.now() - 2_000).toISOString(),
      })
      .expect(201);

    // 6. Driver triggers urgent SOS + Admin lists, acknowledges & resolves alerts
    const sosRes = await request(app.getHttpServer())
      .post('/api/v1/driver/safety/sos')
      .set(driverHeaders)
      .send({
        tripId,
        latitude: 17.445,
        longitude: 78.51,
        notes: 'Vehicle breakdown on Outer Ring Road flyover',
      })
      .expect(201);
    const sosAlertId = sosRes.body.data.id as string;

    let orgAlerts: Array<{ id: string; alertType: string; status: string }> = [];
    for (let attempt = 0; attempt < 25; attempt++) {
      const listAlertsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/safety/alerts')
        .set(managerHeaders)
        .expect(200);
      orgAlerts = listAlertsRes.body.data as Array<{
        id: string;
        alertType: string;
        status: string;
      }>;
      if (
        orgAlerts.some((a) => a.id === sosAlertId && a.alertType === 'SOS') &&
        orgAlerts.some((a) => a.alertType === 'ROUTE_DEVIATION')
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    expect(orgAlerts.some((a) => a.id === sosAlertId && a.alertType === 'SOS')).toBe(true);
    expect(orgAlerts.some((a) => a.alertType === 'ROUTE_DEVIATION')).toBe(true);

    // Acknowledge SOS
    const ackRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/safety/alerts/${sosAlertId}/acknowledge`)
      .set(managerHeaders)
      .send({ notes: 'Dispatcher called cab driver and dispatched backup cab.' })
      .expect(201);
    expect(ackRes.body.data.status).toBe('ACKNOWLEDGED');

    // Cross-tenant isolation check on safety alert resolution
    await request(app.getHttpServer())
      .post(`/api/v1/admin/safety/alerts/${sosAlertId}/resolve`)
      .set({
        'x-dev-user-id': SEED_IDS.userOrgAdmin,
        'x-dev-org-id': '99999999-9999-4999-8999-999999999999',
        'x-dev-role': 'ORG_ADMIN',
      })
      .send({ resolutionNotes: 'Unauthorized cross-org write' })
      .expect(403);

    // Resolve SOS
    const resolveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/safety/alerts/${sosAlertId}/resolve`)
      .set(managerHeaders)
      .send({ resolutionNotes: 'Backup cab reached spot and passengers safely transferred.' })
      .expect(201);
    expect(resolveRes.body.data.status).toBe('RESOLVED');

    // 7. Mark completed > 20m ago without Safe Reach & trigger run-checks -> creates SAFE_REACH_OVERDUE alert
    await dbService.db
      .update(passengerAssignments)
      .set({ status: 'BOARDED' })
      .where(eq(passengerAssignments.id, pa1Id));
    await dbService.db
      .update(trips)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 25 * 60 * 1000),
      })
      .where(and(eq(trips.id, tripId), eq(trips.organizationId, SEED_IDS.orgAcme)));

    const scanRes = await request(app.getHttpServer())
      .post('/api/v1/admin/safety/run-checks')
      .set(managerHeaders)
      .send({})
      .expect(201);
    expect(scanRes.body.data.createdCount).toBeGreaterThanOrEqual(1);

    // Employee mark-all-read endpoint
    const markAllRes = await request(app.getHttpServer())
      .post('/api/v1/employee/notifications/mark-all-read')
      .set(aaravHeaders)
      .send({})
      .expect(201);
    expect(markAllRes.body.data.markedCount).toBeGreaterThanOrEqual(1);

    ws.close();
  });
});

