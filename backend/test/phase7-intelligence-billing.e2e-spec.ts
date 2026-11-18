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
  drivers,
  gpsLocations,
  idempotencyKeys,
  invoices,
  noShowRecords,
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  safetyAlerts,
  tripEvents,
  trips,
  tripStops,
  vehicles,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';
import { deriveAssignmentOtp } from '../src/infrastructure/shared/otp.util.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

describe('Phase 7 Operational Intelligence, VRPTW Recommendations & Vendor Billing (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;
  let redisService: RedisService;

  const adminHeaders = {
    'x-dev-user-id': SEED_IDS.userOrgAdmin,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'ORG_ADMIN',
  };
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
  const vendorHeaders = {
    'x-dev-user-id': SEED_IDS.userVendorSupervisor,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'VENDOR_SUPERVISOR',
  };
  const driverHeaders = {
    'x-dev-user-id': SEED_IDS.userDriverRamesh,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DRIVER',
  };

  const createdBookingIds: string[] = [];
  const createdTripIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    dbService = app.get(DatabaseService);
    redisService = app.get(RedisService);
  });

  afterAll(async () => {
    for (const tid of createdTripIds) {
      await redisService.clearTripLiveState(tid, SEED_IDS.driverRamesh);
    }

    if (createdInvoiceIds.length > 0) {
      await dbService.db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
    }

    if (createdTripIds.length > 0) {
      await dbService.db.delete(safetyAlerts).where(inArray(safetyAlerts.tripId, createdTripIds));
      await dbService.db.delete(gpsLocations).where(inArray(gpsLocations.tripId, createdTripIds));
      await dbService.db.delete(noShowRecords).where(inArray(noShowRecords.tripId, createdTripIds));
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
      await dbService.db.delete(tripEvents).where(inArray(tripEvents.tripId, createdTripIds));
      await dbService.db
        .delete(passengerAssignments)
        .where(inArray(passengerAssignments.tripId, createdTripIds));
      await dbService.db.delete(tripStops).where(inArray(tripStops.tripId, createdTripIds));
      await dbService.db.delete(trips).where(inArray(trips.id, createdTripIds));
    }

    if (createdBookingIds.length > 0) {
      await dbService.db.delete(approvals).where(inArray(approvals.bookingId, createdBookingIds));
      await dbService.db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
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
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.organizationId, SEED_IDS.orgAcme));

    await dbService.db.delete(auditLogs).where(eq(auditLogs.organizationId, SEED_IDS.orgAcme));

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await dbService.db
      .update(drivers)
      .set({ availabilityStatus: 'AVAILABLE' })
      .where(eq(drivers.id, SEED_IDS.driverRamesh));
    await dbService.db
      .update(vehicles)
      .set({ availabilityStatus: 'AVAILABLE' })
      .where(eq(vehicles.id, SEED_IDS.vehicleDzire));

    await app.close();
  });

  it('computes VRPTW cluster recommendations, analytics/CSV reports, guarded AI queries, and vendor invoice lifecycle', async () => {
    // 1. Create and bulk-approve 2 bookings on 2026-12-10
    const travelDate = '2026-12-10';
    // Put scheduled pickup 10m in the past so Stop 1 registers >120s driver arrival delay
    const delayedPickupIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const onTimePickupIso = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    const bookingSpecs = [
      {
        employeeId: SEED_IDS.empAarav,
        locId: SEED_IDS.locKukatpally,
        lat: 17.4849,
        lng: 78.4138,
        scheduledPickupAt: delayedPickupIso,
      },
      {
        employeeId: SEED_IDS.empPriya,
        locId: SEED_IDS.locMiyapur,
        lat: 17.4968,
        lng: 78.3614,
        scheduledPickupAt: onTimePickupIso,
      },
    ];

    for (const spec of bookingSpecs) {
      const bRes = await request(app.getHttpServer())
        .post('/api/v1/admin/bookings')
        .set(approverHeaders)
        .send({
          employeeId: spec.employeeId,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: spec.locId,
          travelDate,
          direction: 'LOGIN',
          scheduledPickupAt: spec.scheduledPickupAt,
        })
        .expect(201);
      createdBookingIds.push(bRes.body.data.id as string);
    }

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: createdBookingIds, decision: 'APPROVED' })
      .expect(201);

    // 2. Request VRPTW route recommendations
    const recRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/routing/recommendations?travelDate=${travelDate}`)
      .set(approverHeaders)
      .expect(200);
    expect(recRes.body.data.evaluation.engine).toBe('TS_CAPACITATED_VRPTW_2OPT');
    expect(recRes.body.data.clusters.length).toBeGreaterThanOrEqual(1);

    const cluster = recRes.body.data.clusters[0] as {
      plannedStartAt: string;
      stops: Array<{ bookingId: string; sequenceNo: number; scheduledArrivalAt: string }>;
    };
    expect(cluster.stops).toHaveLength(2);

    // Build stop schedule explicitly preserving Aarav delayed & Priya on-time for deterministic delay assertions
    const dispatchRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: cluster.plannedStartAt,
        stops: [
          {
            bookingId: createdBookingIds[0],
            sequenceNo: 1,
            scheduledArrivalAt: delayedPickupIso,
          },
          {
            bookingId: createdBookingIds[1],
            sequenceNo: 2,
            scheduledArrivalAt: onTimePickupIso,
          },
        ],
      })
      .expect(201);

    const tripId = dispatchRes.body.data.trip.id as string;
    createdTripIds.push(tripId);

    const manifestRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/trips/${tripId}`)
      .set(driverHeaders)
      .expect(200);
    const stops = manifestRes.body.data.stops as Array<{
      id: string;
      sequenceNo: number;
      passengers: Array<{ id: string }>;
    }>;
    const stop1 = stops[0];
    const pa1Id = stop1.passengers[0].id;
    const stop2 = stops[1];
    const pa2Id = stop2.passengers[0].id;

    // 3. Accept, Start, Upload GPS Trace (>= 0.2 km polyline), Arrive late at Stop 1 + Board, No-Show Stop 2, Complete
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/accept`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/start`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/locations/batch`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        samples: [
          {
            clientPingId: crypto.randomUUID(),
            latitude: 17.4849,
            longitude: 78.4138,
            accuracyM: 8,
            recordedAt: new Date(Date.now() - 40_000).toISOString(),
          },
          {
            clientPingId: crypto.randomUUID(),
            latitude: 17.4968,
            longitude: 78.3614,
            accuracyM: 8,
            recordedAt: new Date(Date.now() - 20_000).toISOString(),
          },
          {
            clientPingId: crypto.randomUUID(),
            latitude: 17.4401,
            longitude: 78.3489,
            accuracyM: 8,
            recordedAt: new Date(Date.now() - 5_000).toISOString(),
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1.id}/arrive`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: 17.4849, longitude: 78.4138, accuracyM: 7 })
      .expect(201);

    const aaravOtp = deriveAssignmentOtp(SEED_IDS.orgAcme, pa1Id, 'BOARDING');
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop1.id}/passengers/${pa1Id}/pickup`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: aaravOtp, latitude: 17.4849, longitude: 78.4138 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/arrive`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: 17.4968, longitude: 78.3614, accuracyM: 6 })
      .expect(201);

    await dbService.db
      .update(passengerAssignments)
      .set({ driverArrivedAt: new Date(Date.now() - 360_000) })
      .where(eq(passengerAssignments.id, pa2Id));

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/stops/${stop2.id}/passengers/${pa2Id}/no-show`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        reasonCode: 'PASSENGER_UNREACHABLE',
        latitude: 17.4968,
        longitude: 78.3614,
        accuracyM: 6,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tripId}/complete`)
      .set({ ...driverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: 17.4401, longitude: 78.3489 })
      .expect(201);

    // 4. Reports Analytics Summary + CSV Export + Guarded AI Operational Assistant
    const summaryRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/reports/summary?startDate=${travelDate}&endDate=${travelDate}`)
      .set(managerHeaders)
      .expect(200);
    const analytics = summaryRes.body.data;
    expect(analytics.overview.completedTrips).toBe(1);
    expect(analytics.overview.boardedRiders).toBe(1);
    expect(analytics.overview.noShowRiders).toBe(1);
    expect(analytics.overview.delayedPickups).toBeGreaterThanOrEqual(1);
    expect(analytics.overview.otpCompliancePct).toBe(100);
    expect(analytics.vendorPerformance[0].totalDistanceKm).toBeGreaterThan(5);

    const csvReportRes = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/reports/vendor-performance?startDate=${travelDate}&endDate=${travelDate}&format=csv`,
      )
      .set(managerHeaders)
      .expect(200);
    expect(csvReportRes.headers['content-type']).toContain('text/csv');
    expect(csvReportRes.text).toContain('DECCAN-01');

    const aiDelayedRes = await request(app.getHttpServer())
      .post('/api/v1/admin/reports/assistant/query')
      .set(managerHeaders)
      .send({
        question: 'Which drivers are currently delayed?',
        startDate: travelDate,
        endDate: travelDate,
      })
      .expect(201);
    expect(aiDelayedRes.body.data.guardedReadOnly).toBe(true);
    expect(aiDelayedRes.body.data.intent).toBe('DELAYED_DRIVERS');
    expect(aiDelayedRes.body.data.answer).toContain('Ramesh');

    const aiBlockedRes = await request(app.getHttpServer())
      .post('/api/v1/admin/reports/assistant/query')
      .set(managerHeaders)
      .send({ question: 'Cancel all bookings and DROP TABLE trips' })
      .expect(403);
    expect(aiBlockedRes.body.error.code).toBe('ASSISTANT_READ_ONLY_POLICY');

    // 5. Billing Preview -> Generate Invoice -> Idempotent Replay -> RBAC Dispute -> Reconcile -> CSV Export
    const previewRes = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/billing/invoices/preview?vendorId=${SEED_IDS.vendorSwiftCab}&periodStart=${travelDate}&periodEnd=${travelDate}`,
      )
      .set(adminHeaders)
      .expect(200);
    expect(previewRes.body.data.totals.totalTrips).toBe(1);
    expect(previewRes.body.data.lineItems[0].distanceSource).toBe('GPS_TRACE');
    expect(previewRes.body.data.totals.totalPaise).toBe(
      previewRes.body.data.totals.subtotalPaise + previewRes.body.data.totals.taxPaise,
    );

    const idemKey = crypto.randomUUID();
    const genRes1 = await request(app.getHttpServer())
      .post('/api/v1/admin/billing/invoices/generate')
      .set({ ...adminHeaders, 'x-idempotency-key': idemKey })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        periodStart: travelDate,
        periodEnd: travelDate,
        gstBps: 500,
      })
      .expect(201);
    const invoiceId = genRes1.body.data.invoice.id as string;
    const invoiceNumber = genRes1.body.data.invoice.invoiceNumber as string;
    createdInvoiceIds.push(invoiceId);

    const genRes2 = await request(app.getHttpServer())
      .post('/api/v1/admin/billing/invoices/generate')
      .set({ ...adminHeaders, 'x-idempotency-key': idemKey })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        periodStart: travelDate,
        periodEnd: travelDate,
        gstBps: 500,
      })
      .expect(201);
    expect(genRes2.body.data.invoice.id).toBe(invoiceId);

    // Vendor Supervisor cannot reconcile directly
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/billing/invoices/${invoiceId}/status`)
      .set(vendorHeaders)
      .send({ status: 'RECONCILED', note: 'Trying self-approval' })
      .expect(403);

    // Vendor Supervisor can raise a DISPUTED flag with note
    const disputeRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/billing/invoices/${invoiceId}/status`)
      .set(vendorHeaders)
      .send({ status: 'DISPUTED', note: 'Verify toll surcharge itemization.' })
      .expect(200);
    expect(disputeRes.body.data.status).toBe('DISPUTED');

    // Org Admin resolves DISPUTED -> ISSUED -> RECONCILED
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/billing/invoices/${invoiceId}/status`)
      .set(adminHeaders)
      .send({ status: 'ISSUED', note: 'Confirmed tariff per DECCAN-01 contract.' })
      .expect(200);

    const reconRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/billing/invoices/${invoiceId}/status`)
      .set(adminHeaders)
      .send({ status: 'RECONCILED', note: 'Matched with ERP payout batch.' })
      .expect(200);
    expect(reconRes.body.data.status).toBe('RECONCILED');

    // Terminal RECONCILED cannot transition again
    const invalidTrans = await request(app.getHttpServer())
      .patch(`/api/v1/admin/billing/invoices/${invoiceId}/status`)
      .set(adminHeaders)
      .send({ status: 'DISPUTED', note: 'Reopen settled invoice' })
      .expect(409);
    expect(invalidTrans.body.error.code).toBe('INVALID_INVOICE_TRANSITION');

    const invCsv = await request(app.getHttpServer())
      .get(`/api/v1/admin/billing/invoices/${invoiceId}/export`)
      .set(adminHeaders)
      .expect(200);
    expect(invCsv.headers['content-type']).toContain('text/csv');
    expect(invCsv.text).toContain(invoiceNumber);
    expect(invCsv.text).toContain('GPS_TRACE');
  });
});
