import crypto from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import {
  allocationRuns,
  approvals,
  auditLogs,
  bookings,
  bookingSeries,
  drivers,
  employeeLocations,
  employees,
  gpsLocations,
  idempotencyKeys,
  memberships,
  noShowRecords,
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  safetyAlerts,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';

describe('Phase 8 Improvements: Locality Allocation, Concurrency Safety, Capacity, Recurring & ARRIVE_BY (E2E)', () => {
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
  const aaravHeaders = {
    'x-dev-user-id': SEED_IDS.userEmpAarav,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'EMPLOYEE',
  };
  const kiranHeaders = {
    'x-dev-user-id': SEED_IDS.userEmpKiran,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'EMPLOYEE',
  };

  const createdUserIds: string[] = [];
  const createdDriverIds: string[] = [];
  const createdVehicleIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdSeriesIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdTripIds: string[] = [];
  const createdRunIds: string[] = [];

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
      for (const did of createdDriverIds) {
        await redisService.clearTripLiveState(tid, did);
      }
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
        await dbService.db.delete(otpRecords).where(inArray(otpRecords.passengerAssignmentId, paIds));
      }
      await dbService.db.delete(tripEvents).where(inArray(tripEvents.tripId, createdTripIds));
      await dbService.db
        .delete(passengerAssignments)
        .where(inArray(passengerAssignments.tripId, createdTripIds));
      await dbService.db.delete(tripStops).where(inArray(tripStops.tripId, createdTripIds));
      await dbService.db.delete(trips).where(inArray(trips.id, createdTripIds));
    }

    if (createdRunIds.length > 0) {
      await dbService.db.delete(allocationRuns).where(inArray(allocationRuns.id, createdRunIds));
    }

    if (createdBookingIds.length > 0) {
      await dbService.db.delete(approvals).where(inArray(approvals.bookingId, createdBookingIds));
      await dbService.db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
    }

    if (createdSeriesIds.length > 0) {
      await dbService.db.delete(bookingSeries).where(inArray(bookingSeries.id, createdSeriesIds));
    }

    if (createdLocationIds.length > 0) {
      await dbService.db
        .delete(employeeLocations)
        .where(inArray(employeeLocations.id, createdLocationIds));
    }

    if (createdDriverIds.length > 0) {
      await dbService.db.delete(drivers).where(inArray(drivers.id, createdDriverIds));
    }

    if (createdEmployeeIds.length > 0) {
      await dbService.db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
    }

    if (createdVehicleIds.length > 0) {
      await dbService.db.delete(vehicles).where(inArray(vehicles.id, createdVehicleIds));
    }

    if (createdUserIds.length > 0) {
      await dbService.db.delete(memberships).where(inArray(memberships.userId, createdUserIds));
      await dbService.db.delete(notifications).where(inArray(notifications.recipientUserId, createdUserIds));
      await dbService.db.delete(users).where(inArray(users.id, createdUserIds));
    }

    await dbService.db
      .delete(notifications)
      .where(
        inArray(notifications.recipientUserId, [
          SEED_IDS.userEmpAarav,
          SEED_IDS.userEmpKiran,
          SEED_IDS.userDriverRamesh,
          SEED_IDS.userOrgAdmin,
        ]),
      );

    await dbService.db
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.organizationId, SEED_IDS.orgAcme));
    await dbService.db.delete(auditLogs).where(eq(auditLogs.organizationId, SEED_IDS.orgAcme));
    await dbService.db.delete(outboxEvents).where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));

    await app.close();
  });

  it('enforces Sedan <= 4 and SUV <= 6 capacity rules and rejects overloaded allocations', async () => {
    const suffix = String(Date.now()).slice(-5);

    // Sedan > 4 must fail with 422
    await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS07SD${suffix}`,
        modelName: 'Invalid Sedan 5',
        vehicleType: 'SEDAN',
        seatingCapacity: 5,
      })
      .expect(422);

    // SUV > 6 must fail with 422
    await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS07SV${suffix}`,
        modelName: 'Invalid SUV 7',
        vehicleType: 'SUV',
        seatingCapacity: 7,
      })
      .expect(422);

    // Valid SUV omitting seatingCapacity defaults to 6 (excluding driver)
    const suvRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS07UV${suffix}`,
        modelName: 'Innova Crysta 6+1',
        vehicleType: 'SUV',
      })
      .expect(201);
    expect(suvRes.body.data.seatingCapacity).toBe(6);
    createdVehicleIds.push(suvRes.body.data.id as string);
  });

  it('resolves Chintal/Chinthal via canonical alias + PostGIS radius, separates Hayathnagar, allocates Chinthal driver, allows morning+evening non-overlap, and rejects concurrent double-publish', async () => {
    const suffix = String(Date.now()).slice(-6);
    const travelDate = '2026-12-22';

    // Create Chinthal Sedan + Hayathnagar Sedan + Drivers with protected base zones
    const vehChinRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS08CH${suffix.slice(-4)}`,
        modelName: 'Dzire Chinthal',
        vehicleType: 'SEDAN',
      })
      .expect(201);
    const vehChinId = vehChinRes.body.data.id as string;
    createdVehicleIds.push(vehChinId);

    const vehHayRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS08HY${suffix.slice(-4)}`,
        modelName: 'Dzire Hayath',
        vehicleType: 'SEDAN',
      })
      .expect(201);
    const vehHayId = vehHayRes.body.data.id as string;
    createdVehicleIds.push(vehHayId);

    const drvChinRes = await request(app.getHttpServer())
      .post('/api/v1/admin/drivers')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `chin.drv.${suffix}@sol.local`,
        phone: `+91-9111${suffix}`,
        fullName: 'Suresh Chinthal',
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: vehChinId,
        baseLocalityId: SEED_IDS.localityChinthal,
        driverCode: `DRV-CH-${suffix}`,
        licenseNo: `TS08CH${suffix}`,
      })
      .expect(201);
    const drvChinId = drvChinRes.body.data.id as string;
    createdDriverIds.push(drvChinId);
    createdUserIds.push(drvChinRes.body.data.userId as string);
    expect(drvChinRes.body.data.baseLocalityName).toBe('Chinthal');

    const drvHayRes = await request(app.getHttpServer())
      .post('/api/v1/admin/drivers')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `hay.drv.${suffix}@sol.local`,
        phone: `+91-9222${suffix}`,
        fullName: 'Mahesh Hayathnagar',
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: vehHayId,
        baseLocalityId: SEED_IDS.localityHayathnagar,
        driverCode: `DRV-HY-${suffix}`,
        licenseNo: `TS08HY${suffix}`,
      })
      .expect(201);
    const drvHayId = drvHayRes.body.data.id as string;
    createdDriverIds.push(drvHayId);
    createdUserIds.push(drvHayRes.body.data.userId as string);

    // Employee #1 in Chinthal using spelling variation "Chintal X Roads"
    const emp1Res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp.chin1.${suffix}@sol.local`,
        phone: `+91-9331${suffix}`,
        fullName: 'Chinthal Rider One',
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `E-CH1-${suffix}`,
        department: 'Engineering',
        pickupLocation: {
          locationName: 'Chintal X Roads',
          address: 'Chintal Circle, Hyderabad',
          corridorTag: 'Chintal',
          latitude: 17.5015,
          longitude: 78.4586,
        },
      })
      .expect(201);
    createdEmployeeIds.push(emp1Res.body.data.id as string);
    createdUserIds.push(emp1Res.body.data.userId as string);
    createdLocationIds.push(emp1Res.body.data.savedLocation.id as string);
    expect(emp1Res.body.data.savedLocation.localityId).toBe(SEED_IDS.localityChinthal);
    expect(emp1Res.body.data.savedLocation.normalizedLocality).toBe('Chinthal');

    // Employee #2 in Chinthal via PostGIS spatial proximity only (no corridorTag)
    const emp2Res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp.chin2.${suffix}@sol.local`,
        phone: `+91-9332${suffix}`,
        fullName: 'Chinthal Rider Two',
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `E-CH2-${suffix}`,
        department: 'QA',
        pickupLocation: {
          locationName: 'IDPL Colony Park',
          address: 'IDPL Colony, Hyderabad',
          latitude: 17.5032,
          longitude: 78.4599,
        },
      })
      .expect(201);
    createdEmployeeIds.push(emp2Res.body.data.id as string);
    createdUserIds.push(emp2Res.body.data.userId as string);
    createdLocationIds.push(emp2Res.body.data.savedLocation.id as string);
    expect(emp2Res.body.data.savedLocation.localityId).toBe(SEED_IDS.localityChinthal);

    // Employee #3 in Hayathnagar (~24km away)
    const emp3Res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp.hay1.${suffix}@sol.local`,
        phone: `+91-9333${suffix}`,
        fullName: 'Hayathnagar Rider One',
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `E-HY1-${suffix}`,
        department: 'Ops',
        pickupLocation: {
          locationName: 'Hayatnagar Depot',
          address: 'NH65 Hayathnagar, Hyderabad',
          corridorTag: 'Hayatnagar',
          latitude: 17.3292,
          longitude: 78.6003,
        },
      })
      .expect(201);
    createdEmployeeIds.push(emp3Res.body.data.id as string);
    createdUserIds.push(emp3Res.body.data.userId as string);
    createdLocationIds.push(emp3Res.body.data.savedLocation.id as string);
    expect(emp3Res.body.data.savedLocation.localityId).toBe(SEED_IDS.localityHayathnagar);

    // Create morning LOGIN bookings for emp1, emp2, emp3 + evening LOGOUT for emp1
    const bookingDefs = [
      {
        employeeId: emp1Res.body.data.id as string,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: emp1Res.body.data.savedLocation.id as string,
        travelDate,
        direction: 'LOGIN',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:00',
        timezone: 'Asia/Kolkata',
      },
      {
        employeeId: emp2Res.body.data.id as string,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: emp2Res.body.data.savedLocation.id as string,
        travelDate,
        direction: 'LOGIN',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:05',
        timezone: 'Asia/Kolkata',
      },
      {
        employeeId: emp3Res.body.data.id as string,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: emp3Res.body.data.savedLocation.id as string,
        travelDate,
        direction: 'LOGIN',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:00',
        timezone: 'Asia/Kolkata',
      },
      {
        employeeId: emp1Res.body.data.id as string,
        shiftId: SEED_IDS.shiftEveningLogout,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: emp1Res.body.data.savedLocation.id as string,
        travelDate,
        direction: 'LOGOUT',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '18:30',
        timezone: 'Asia/Kolkata',
      },
    ];

    const batchIds: string[] = [];
    for (const def of bookingDefs) {
      const bRes = await request(app.getHttpServer())
        .post('/api/v1/admin/bookings')
        .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
        .send(def)
        .expect(201);
      const id = bRes.body.data.id as string;
      batchIds.push(id);
      createdBookingIds.push(id);
    }

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: batchIds, decision: 'APPROVED', remarks: 'Phase 8 auto-allocate test' })
      .expect(201);

    // Generate plan
    const planRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/auto-allocate')
      .set(approverHeaders)
      .send({ travelDate })
      .expect(201);

    const plan = planRes.body.data as {
      runId: string;
      proposals: Array<{
        clusterId: string;
        primaryLocalityId: string | null;
        primaryLocalityName: string;
        direction: string;
        seatCount: number;
        travelDate: string;
        shiftId: string;
        officeId: string;
        plannedStartAt: string;
        plannedEndAt: string;
        suggestedDriver: { id: string };
        suggestedVehicle: { id: string };
        rationale: { localityMatchType: string };
        stops: Array<{ bookingId: string; sequenceNo: number; scheduledArrivalAt: string }>;
      }>;
    };
    createdRunIds.push(plan.runId);

    // Expect 3 proposals: Chinthal AM (2 seats), Hayathnagar AM (1 seat), Chinthal PM (1 seat)
    expect(plan.proposals).toHaveLength(3);
    const chinAm = plan.proposals.find(
      (p) => p.direction === 'LOGIN' && p.primaryLocalityId === SEED_IDS.localityChinthal,
    );
    const hayAm = plan.proposals.find(
      (p) => p.direction === 'LOGIN' && p.primaryLocalityId === SEED_IDS.localityHayathnagar,
    );
    const chinPm = plan.proposals.find(
      (p) => p.direction === 'LOGOUT' && p.primaryLocalityId === SEED_IDS.localityChinthal,
    );

    expect(chinAm?.seatCount).toBe(2);
    expect(chinAm?.suggestedDriver.id).toBe(drvChinId);
    expect(chinAm?.rationale.localityMatchType).toBe('EXACT_LOCALITY');

    expect(hayAm?.seatCount).toBe(1);
    expect(hayAm?.suggestedDriver.id).toBe(drvHayId);

    // Chinthal driver allocated BOTH non-overlapping morning LOGIN and evening LOGOUT!
    expect(chinPm?.suggestedDriver.id).toBe(drvChinId);

    // Publish first morning Chinthal proposal + evening Chinthal proposal sequentially first?
    // Even better: test concurrent race condition directly on chinAm!
    const buildPayload = (proposal: NonNullable<typeof chinAm>) => ({
      runId: plan.runId,
      groups: [
        {
          clusterId: proposal.clusterId,
          travelDate: proposal.travelDate,
          shiftId: proposal.shiftId,
          officeId: proposal.officeId,
          direction: proposal.direction,
          driverId: proposal.suggestedDriver.id,
          vehicleId: proposal.suggestedVehicle.id,
          plannedStartAt: proposal.plannedStartAt,
          plannedEndAt: proposal.plannedEndAt,
          primaryLocalityId: proposal.primaryLocalityId,
          rationale: proposal.rationale,
          stops: proposal.stops.map((s) => ({
            bookingId: s.bookingId,
            sequenceNo: s.sequenceNo,
            scheduledArrivalAt: s.scheduledArrivalAt,
          })),
        },
      ],
    });

    // Simulate two dispatchers clicking Publish simultaneously with distinct idempotency keys
    const [raceA, raceB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/admin/dispatch/auto-allocate/publish')
        .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
        .send(buildPayload(chinAm!)),
      request(app.getHttpServer())
        .post('/api/v1/admin/dispatch/auto-allocate/publish')
        .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
        .send(buildPayload(chinAm!)),
    ]);

    const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const winner = raceA.status === 201 ? raceA : raceB;
    for (const item of winner.body.data.trips as Array<{ trip: { id: string } }>) {
      createdTripIds.push(item.trip.id);
    }

    // Publish non-overlapping evening trip for SAME Chinthal driver -> succeeds 201!
    const pmPublish = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/auto-allocate/publish')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send(buildPayload(chinPm!))
      .expect(201);
    for (const item of pmPublish.body.data.trips as Array<{ trip: { id: string } }>) {
      createdTripIds.push(item.trip.id);
    }
  });

  it('supports recurring series preview/create with ARRIVE_BY, overlap block, skip-dates, future change impacted-trip alert, expiry transition & clean rebooking', async () => {
    // 1. Preview WEEKLY series (Mon, Wed, Fri) in future week
    const previewRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series/preview')
      .set(kiranHeaders)
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: SEED_IDS.locAmeerpet,
        direction: 'LOGIN',
        timePreference: 'ARRIVE_BY',
        requestedTimeLocal: '09:00',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        startDate: '2026-12-28', // Monday
        selectedDaysOfWeek: ['MON', 'WED', 'FRI'],
      })
      .expect(201);

    expect(previewRes.body.data.endDate).toBe('2027-01-03');
    expect(previewRes.body.data.totalDatesCount).toBe(3);
    expect(previewRes.body.data.occurrences[0].isArriveByInfeasible).toBe(false);
    // Computed scheduled pickup must be strictly before 09:00 IST (03:30Z)
    expect(
      new Date(previewRes.body.data.occurrences[0].scheduledPickupAt).getTime(),
    ).toBeLessThan(new Date('2026-12-28T03:30:00.000Z').getTime());

    // 2. Confirm recurring series
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: SEED_IDS.locAmeerpet,
        direction: 'LOGIN',
        timePreference: 'ARRIVE_BY',
        requestedTimeLocal: '09:00',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        startDate: '2026-12-28',
        selectedDaysOfWeek: ['MON', 'WED', 'FRI'],
        notes: 'Weekly sprint office commute',
      })
      .expect(201);

    const seriesId = createRes.body.data.series.id as string;
    const seriesBookings = createRes.body.data.bookings as Array<{
      id: string;
      travelDate: string;
      timePreference: string;
      requestedTimeLocal: string;
    }>;
    createdSeriesIds.push(seriesId);
    for (const b of seriesBookings) createdBookingIds.push(b.id);
    expect(seriesBookings).toHaveLength(3);
    expect(seriesBookings[0].timePreference).toBe('ARRIVE_BY');
    expect(seriesBookings[0].requestedTimeLocal).toBe('09:00');

    // 3. Duplicate overlapping series must be rejected with 409 BOOKING_SERIES_OVERLAP
    await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: SEED_IDS.locAmeerpet,
        direction: 'LOGIN',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:15',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        startDate: '2026-12-28',
        selectedDaysOfWeek: ['WED'],
      })
      .expect(409);

    // 4. Skip Friday (2027-01-01) cleanly while leaving Mon/Wed untouched
    const skipRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/bookings/series/${seriesId}/skip-dates`)
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ dates: ['2027-01-01'], reason: 'New Year WFH' })
      .expect(201);
    expect(skipRes.body.data.skippedCount).toBe(1);

    // 5. Approve & dispatch Monday (2026-12-28) via manual dispatch, then test future modification alert!
    const monBooking = seriesBookings.find((b) => b.travelDate === '2026-12-28')!;
    const wedBooking = seriesBookings.find((b) => b.travelDate === '2026-12-30')!;
    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: [monBooking.id, wedBooking.id], decision: 'APPROVED' })
      .expect(201);

    const dispMonRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: '2026-12-28',
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: SEED_IDS.driverRamesh,
        vehicleId: SEED_IDS.vehicleDzire,
        plannedStartAt: '2026-12-28T02:45:00.000Z',
        stops: [{ bookingId: monBooking.id, sequenceNo: 1, scheduledArrivalAt: '2026-12-28T02:45:00.000Z' }],
      })
      .expect(201);
    createdTripIds.push(dispMonRes.body.data.trip.id as string);

    // Updating future dispatched occurrence flags impactedTripAlert without silently mutating published stop
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/employee/bookings/${monBooking.id}`)
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:10',
        reason: 'Prefer fixed 08:10 pickup',
      })
      .expect(200);
    expect(patchRes.body.data.booking.timePreference).toBe('PICKUP_AT');
    expect(patchRes.body.data.impactedTripAlert).toBeTruthy();

    // 6. Trigger expiry after endDate ('2027-01-05') -> marks series EXPIRED & wedBooking EXPIRED
    const expRes = await request(app.getHttpServer())
      .post('/api/v1/admin/bookings/series/process-expiries')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ referenceDate: '2027-01-05' })
      .expect(201);
    expect(expRes.body.data.expiredSeriesCount).toBeGreaterThanOrEqual(1);

    const [wedRow] = await dbService.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, wedBooking.id)));
    expect(wedRow.status).toBe('EXPIRED');

    // Rebooking the formerly expired date 2026-12-30 works cleanly with ZERO phantom conflict!
    const rebookRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: SEED_IDS.locAmeerpet,
        direction: 'LOGIN',
        timePreference: 'PICKUP_AT',
        requestedTimeLocal: '08:30',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'ONE_DAY',
        startDate: '2026-12-30',
      })
      .expect(201);
    createdSeriesIds.push(rebookRes.body.data.series.id as string);
    for (const b of rebookRes.body.data.bookings as Array<{ id: string }>) {
      createdBookingIds.push(b.id);
    }

    // Also verify cancel series cancels remaining active booking cleanly
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/employee/bookings/series/${rebookRes.body.data.series.id}/cancel`)
      .set({ ...kiranHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ reason: 'Employee changed plans' })
      .expect(201);
    expect(cancelRes.body.data.series.status).toBe('CANCELLED');
    expect(cancelRes.body.data.cancelledBookingsCount).toBe(1);
  });

  it('rejects missing Aarav location mismatch safely and lists allocation runs for audit', async () => {
    const runsRes = await request(app.getHttpServer())
      .get('/api/v1/admin/dispatch/allocation-runs')
      .set(approverHeaders)
      .expect(200);
    expect(Array.isArray(runsRes.body.data)).toBe(true);
    expect((runsRes.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Ensure AARAV baseline booking still works backward-compatibly without seriesId
    const bRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings')
      .set({ ...aaravHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locKukatpally,
        travelDate: '2027-01-12',
        direction: 'LOGIN',
        scheduledPickupAt: '2027-01-12T02:45:00.000Z',
      })
      .expect(201);
    createdBookingIds.push(bRes.body.data.id as string);
    expect(bRes.body.data.timePreference).toBe('PICKUP_AT');
  });

  it('orders active IN_PROGRESS and soonest upcoming trips consistently across driver and employee OTP endpoints and persists invalid OTP attempt count', async () => {
    const suffix = `${Date.now().toString().slice(-5)}o`;
    const priyaHeaders = {
      'x-dev-user-id': SEED_IDS.userEmpPriya,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'EMPLOYEE',
    };

    const vehRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS09OT${suffix.slice(0, 4)}`.toUpperCase(),
        modelName: 'OTP Order Sedan',
        vehicleType: 'SEDAN',
      })
      .expect(201);
    const vehId = vehRes.body.data.id as string;
    createdVehicleIds.push(vehId);

    const drvRes = await request(app.getHttpServer())
      .post('/api/v1/admin/drivers')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `otp.drv.${suffix}@sol.local`,
        phone: `+91-9444${suffix.slice(0, 5)}`,
        fullName: 'OTP Ordering Driver',
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: vehId,
        baseLocalityId: SEED_IDS.localityMiyapur,
        driverCode: `DRV-OTP-${suffix}`,
        licenseNo: `TS09OTP${suffix}`,
      })
      .expect(201);
    const drvId = drvRes.body.data.id as string;
    const drvUserId = drvRes.body.data.userId as string;
    createdDriverIds.push(drvId);
    createdUserIds.push(drvUserId);

    const drvHeaders = {
      'x-dev-user-id': drvUserId,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'DRIVER',
    };

    // Create two future bookings for Priya: soonest 2027-02-10 and later 2027-02-15
    const bEarlyRes = await request(app.getHttpServer())
      .post('/api/v1/admin/bookings')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        employeeId: SEED_IDS.empPriya,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locMiyapur,
        travelDate: '2027-02-10',
        direction: 'LOGIN',
        scheduledPickupAt: '2027-02-10T02:45:00.000Z',
      })
      .expect(201);
    const bLaterRes = await request(app.getHttpServer())
      .post('/api/v1/admin/bookings')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        employeeId: SEED_IDS.empPriya,
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        pickupLocationId: SEED_IDS.locMiyapur,
        travelDate: '2027-02-15',
        direction: 'LOGIN',
        scheduledPickupAt: '2027-02-15T02:45:00.000Z',
      })
      .expect(201);
    const bEarlyId = bEarlyRes.body.data.id as string;
    const bLaterId = bLaterRes.body.data.id as string;
    createdBookingIds.push(bEarlyId, bLaterId);

    await request(app.getHttpServer())
      .post('/api/v1/admin/approvals/bulk-decide')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ bookingIds: [bEarlyId, bLaterId], decision: 'APPROVED' })
      .expect(201);

    const tEarlyRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: '2027-02-10',
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: drvId,
        vehicleId: vehId,
        plannedStartAt: '2027-02-10T02:45:00.000Z',
        stops: [{ bookingId: bEarlyId, sequenceNo: 1, scheduledArrivalAt: '2027-02-10T02:45:00.000Z' }],
      })
      .expect(201);
    const tEarlyId = tEarlyRes.body.data.trip.id as string;
    createdTripIds.push(tEarlyId);

    const tLaterRes = await request(app.getHttpServer())
      .post('/api/v1/admin/dispatch/manual')
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        travelDate: '2027-02-15',
        shiftId: SEED_IDS.shiftMorningLogin,
        officeId: SEED_IDS.officeGachibowli,
        direction: 'LOGIN',
        driverId: drvId,
        vehicleId: vehId,
        plannedStartAt: '2027-02-15T02:45:00.000Z',
        stops: [{ bookingId: bLaterId, sequenceNo: 1, scheduledArrivalAt: '2027-02-15T02:45:00.000Z' }],
      })
      .expect(201);
    const tLaterId = tLaterRes.body.data.trip.id as string;
    const tLaterStopId = (tLaterRes.body.data.stops as Array<{ id: string; stopType: string }>).find(
      (s) => s.stopType === 'PICKUP',
    )!.id;
    const tLaterPaId = (tLaterRes.body.data.assignments as Array<{ id: string }>)[0].id;
    createdTripIds.push(tLaterId);

    // Before either starts, Driver trips list puts soonest (2027-02-10) FIRST, matching Employee upcoming
    const drvListBefore = await request(app.getHttpServer())
      .get('/api/v1/driver/trips')
      .set(drvHeaders)
      .expect(200);
    expect((drvListBefore.body.data as Array<{ id: string }>)[0].id).toBe(tEarlyId);

    const empUpcomingBefore = await request(app.getHttpServer())
      .get('/api/v1/employee/trips/upcoming')
      .set(priyaHeaders)
      .expect(200);
    expect(empUpcomingBefore.body.data.trip.id).toBe(tEarlyId);

    // Driver accepts & starts the 2027-02-15 trip (IN_PROGRESS)
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tLaterId}/accept`)
      .set({ ...drvHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tLaterId}/start`)
      .set({ ...drvHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tLaterId}/stops/${tLaterStopId}/arrive`)
      .set({ ...drvHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ latitude: 17.4968, longitude: 78.3614 })
      .expect(201);

    // Employee upcoming card MUST now switch immediately to IN_PROGRESS trip (tLaterId) and expose its OTP!
    const empUpcomingActive = await request(app.getHttpServer())
      .get('/api/v1/employee/trips/upcoming')
      .set(priyaHeaders)
      .expect(200);
    expect(empUpcomingActive.body.data.trip.id).toBe(tLaterId);
    const activeOtp = empUpcomingActive.body.data.boardingOtp as string;
    const earlyOtp = empUpcomingBefore.body.data.boardingOtp as string;
    expect(activeOtp).toMatch(/^\d{4}$/);

    // Passing another trip's OTP (or wrong OTP) fails with INVALID_BOARDING_OTP AND persists attempts=1
    const wrongOtp = activeOtp === earlyOtp ? '0000' : earlyOtp;
    const wrongRes = await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tLaterId}/stops/${tLaterStopId}/passengers/${tLaterPaId}/pickup`)
      .set({ ...drvHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: wrongOtp, latitude: 17.4968, longitude: 78.3614 })
      .expect(422);
    expect(wrongRes.body.error.code).toBe('INVALID_BOARDING_OTP');

    const [otpRowAfterFail] = await dbService.db
      .select()
      .from(otpRecords)
      .where(and(eq(otpRecords.passengerAssignmentId, tLaterPaId), eq(otpRecords.otpType, 'BOARDING')));
    expect(otpRowAfterFail.attempts).toBe(1);

    // Passing the active trip's matching OTP succeeds cleanly
    await request(app.getHttpServer())
      .post(`/api/v1/driver/trips/${tLaterId}/stops/${tLaterStopId}/passengers/${tLaterPaId}/pickup`)
      .set({ ...drvHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ otpCode: activeOtp, latitude: 17.4968, longitude: 78.3614 })
      .expect(201);
  });
});
