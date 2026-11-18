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
  employees,
  memberships,
  outboxEvents,
  trips,
  users,
  vehicles,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';

describe('Phase 2 Administrative Operations (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;

  const orgAdminHeaders = {
    'x-dev-user-id': SEED_IDS.userOrgAdmin,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'ORG_ADMIN',
  };
  const approverHeaders = {
    'x-dev-user-id': SEED_IDS.userDutyApprover,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'DUTY_APPROVER',
  };

  const createdUserEmails: string[] = [];
  const createdBookingIds: string[] = [];
  let createdTripId: string | null = null;
  let createdVehicleId: string | null = null;

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
    if (createdTripId) {
      await dbService.db.delete(trips).where(eq(trips.id, createdTripId));
    }
    if (createdBookingIds.length > 0) {
      await dbService.db.delete(approvals).where(inArray(approvals.bookingId, createdBookingIds));
      await dbService.db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
    }
    if (createdVehicleId) {
      await dbService.db.delete(vehicles).where(eq(vehicles.id, createdVehicleId));
    }
    if (createdUserEmails.length > 0) {
      const createdUsers = await dbService.db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, createdUserEmails));
      const userIds = createdUsers.map((u) => u.id);
      if (userIds.length > 0) {
        await dbService.db.delete(employees).where(inArray(employees.userId, userIds));
        await dbService.db.delete(drivers).where(inArray(drivers.userId, userIds));
        await dbService.db.delete(memberships).where(inArray(memberships.userId, userIds));
        await dbService.db.delete(users).where(inArray(users.id, userIds));
      }
    }
    await dbService.db
      .delete(auditLogs)
      .where(eq(auditLogs.actorUserId, SEED_IDS.userDutyApprover));
    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await app.close();
  });

  it('executes CSV employee import -> bulk duty approval -> capacity check -> manual dispatch -> stop reorder -> trip inspection', async () => {
    const ts = Date.now();
    const empEmails = [
      `p2.one.${ts}@acme-hyd.local`,
      `p2.two.${ts}@acme-hyd.local`,
      `p2.three.${ts}@acme-hyd.local`,
    ];
    createdUserEmails.push(...empEmails);

    // 1. Bulk CSV employee import (3 employees with Hyderabad coordinates)
    const csvText = [
      'email,phone,fullName,employeeCode,department,officeCode,shiftCode,locationName,address,corridorTag,latitude,longitude',
      `${empEmails[0]},+91-9111111101,Rohan Deshmukh,EMP-P2-${ts}-1,Engineering,HYD-GCB-01,S1-LOGIN-0900,Kondapur Junction,"Kondapur Main Rd, Hyderabad",Kondapur,17.4622,78.3568`,
      `${empEmails[1]},+91-9111111102,Sneha Reddy,EMP-P2-${ts}-2,Design,HYD-GCB-01,S1-LOGIN-0900,Hitec Mindspace,"Mindspace Gate 2, Madhapur",Madhapur,17.4435,78.3772`,
      `${empEmails[2]},+91-9111111103,Arjun Verma,EMP-P2-${ts}-3,Product,HYD-GCB-01,S1-LOGIN-0900,Jubilee Checkpost,"Road 36, Jubilee Hills",Jubilee Hills,17.4286,78.4126`,
    ].join('\n');

    const importRes = await request(app.getHttpServer())
      .post('/api/v1/admin/employees/import')
      .set(orgAdminHeaders)
      .send({ csvText })
      .expect(201);

    expect(importRes.body.data.importedCount).toBe(3);
    expect(importRes.body.data.errors).toEqual([]);

    // Fetch created employees + locations
    const empListRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/employees?search=EMP-P2-${ts}`)
      .set(orgAdminHeaders)
      .expect(200);
    expect(empListRes.body.data).toHaveLength(3);

    const travelDate = '2026-11-20';
    for (const emp of empListRes.body.data as Array<{ id: string }>) {
      const locsRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/employees/${emp.id}/locations`)
        .set(orgAdminHeaders)
        .expect(200);
      const locId = locsRes.body.data[0].id as string;

      const bookingRes = await request(app.getHttpServer())
        .post('/api/v1/admin/bookings')
        .set(approverHeaders)
        .send({
          employeeId: emp.id,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: locId,
          travelDate,
          direction: 'LOGIN',
          scheduledPickupAt: '2026-11-20T02:40:00.000Z',
        })
        .expect(201);
      createdBookingIds.push(bookingRes.body.data.id as string);
    }

    // 2. Duty Approver filters queue & bulk approves all 3
    const queueRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/approvals/queue?travelDate=${travelDate}&status=PENDING_APPROVAL`)
      .set(approverHeaders)
      .expect(200);
    expect(queueRes.body.data).toHaveLength(3);

    const approveRes = await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        bookingIds: createdBookingIds,
        decision: 'APPROVED',
        remarks: 'Morning shift batch approved',
      })
      .expect(201);
    expect(approveRes.body.data.decidedCount).toBe(3);

    // 3. Verify capacity constraint using a 2-seat vehicle
    const smallVehRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set(orgAdminHeaders)
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS 07 ZZ ${String(ts).slice(-4)}`,
        modelName: 'Compact EV Test',
        vehicleType: 'EV_SEDAN',
        seatingCapacity: 2,
      })
      .expect(201);
    createdVehicleId = smallVehRes.body.data.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set(approverHeaders)
      .send({
        travelDate,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: createdVehicleId,
        plannedStartAt: '2026-11-20T02:30:00.000Z',
        stops: createdBookingIds.map((bookingId, idx) => ({
          bookingId,
          sequenceNo: idx + 1,
          scheduledArrivalAt: `2026-11-20T02:3${idx}:00.000Z`,
        })),
      })
      .expect(422);

    // 4. Publish manual dispatch using 4-seat Dzire
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
        plannedStartAt: '2026-11-20T02:30:00.000Z',
        stops: createdBookingIds.map((bookingId, idx) => ({
          bookingId,
          sequenceNo: idx + 1,
          scheduledArrivalAt: `2026-11-20T02:3${idx}:00.000Z`,
        })),
      })
      .expect(201);

    createdTripId = dispatchRes.body.data.trip.id as string;
    expect(dispatchRes.body.data.trip.status).toBe('ASSIGNED');
    expect(dispatchRes.body.data.stops).toHaveLength(4); // 3 pickups + 1 OFFICE terminus
    expect(dispatchRes.body.data.stops[3].stopType).toBe('OFFICE');

    // 5. Reorder stops via last-minute modification
    const pickupStops = dispatchRes.body.data.stops.slice(0, 3) as Array<{ id: string }>;
    const modifyRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/dispatch/${createdTripId}/modify`)
      .set(approverHeaders)
      .send({
        reason: 'Traffic diversion at Madhapur',
        stopOrder: [
          { stopId: pickupStops[1].id, sequenceNo: 1 },
          { stopId: pickupStops[0].id, sequenceNo: 2 },
          { stopId: pickupStops[2].id, sequenceNo: 3 },
        ],
      })
      .expect(200);

    expect(modifyRes.body.data.stops[0].id).toBe(pickupStops[1].id);

    // 6. Verify Admin Overview KPIs & Trip Detail Inspector
    const overviewRes = await request(app.getHttpServer())
      .get('/api/v1/admin/overview')
      .set(orgAdminHeaders)
      .expect(200);
    expect(overviewRes.body.data.kpis.activeTrips).toBeGreaterThanOrEqual(1);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/trips/${createdTripId}`)
      .set(orgAdminHeaders)
      .expect(200);
    expect(detailRes.body.data.assignments).toHaveLength(3);
    expect(detailRes.body.data.events.map((e: { eventType: string }) => e.eventType)).toContain(
      'TRIP_DISPATCH_MODIFIED',
    );
  });
});

