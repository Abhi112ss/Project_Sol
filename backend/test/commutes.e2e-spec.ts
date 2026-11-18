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
  notifications,
  otpRecords,
  outboxEvents,
  passengerAssignments,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
  memberships,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';

describe('Commute-Centred Workspace & Driver Calendar Scheduling (E2E)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;

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
  });

  afterAll(async () => {
    if (createdTripIds.length > 0) {
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
      await dbService.db
        .delete(notifications)
        .where(inArray(notifications.recipientUserId, createdUserIds));
      await dbService.db.delete(users).where(inArray(users.id, createdUserIds));
    }

    await dbService.db
      .delete(outboxEvents)
      .where(eq(outboxEvents.organizationId, SEED_IDS.orgAcme));
    await dbService.db.delete(auditLogs).where(eq(auditLogs.organizationId, SEED_IDS.orgAcme));

    await app.close();
  });

  it('groups monthly commutes into 1 operator card, supports focused approval/allocation without spam, and renders accurate blue/grey driver calendar across reassignments & cancellations', async () => {
    const suffix = `${Date.now().toString().slice(-5)}c`;

    // Two Sedans + Two Chinthal Drivers (Driver A receives month; Driver B receives 1 reassigned date)
    const vehARes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS11CA${suffix.slice(0, 4)}`.toUpperCase(),
        modelName: 'Commute Sedan A',
        vehicleType: 'SEDAN',
      })
      .expect(201);
    const vehAId = vehARes.body.data.id as string;
    createdVehicleIds.push(vehAId);

    const vehBRes = await request(app.getHttpServer())
      .post('/api/v1/admin/vehicles')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: `TS11CB${suffix.slice(0, 4)}`.toUpperCase(),
        modelName: 'Commute Sedan B',
        vehicleType: 'SEDAN',
      })
      .expect(201);
    const vehBId = vehBRes.body.data.id as string;
    createdVehicleIds.push(vehBId);

    const drvARes = await request(app.getHttpServer())
      .post('/api/v1/admin/drivers')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `drv.cmta.${suffix}@sol.local`,
        phone: `+91-9511${suffix.slice(0, 5)}`,
        fullName: 'Arjun Chinthal',
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: vehAId,
        baseLocalityId: SEED_IDS.localityChinthal,
        driverCode: `DRV-CMTA-${suffix}`,
        licenseNo: `TS11CA${suffix}`,
      })
      .expect(201);
    const drvAId = drvARes.body.data.id as string;
    const drvAUserId = drvARes.body.data.userId as string;
    createdDriverIds.push(drvAId);
    createdUserIds.push(drvAUserId);

    const drvBRes = await request(app.getHttpServer())
      .post('/api/v1/admin/drivers')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `drv.cmtb.${suffix}@sol.local`,
        phone: `+91-9522${suffix.slice(0, 5)}`,
        fullName: 'Vikram Chinthal Backup',
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: vehBId,
        baseLocalityId: SEED_IDS.localityChinthal,
        driverCode: `DRV-CMTB-${suffix}`,
        licenseNo: `TS11CB${suffix}`,
      })
      .expect(201);
    const drvBId = drvBRes.body.data.id as string;
    const drvBUserId = drvBRes.body.data.userId as string;
    createdDriverIds.push(drvBId);
    createdUserIds.push(drvBUserId);

    const drvAHeaders = {
      'x-dev-user-id': drvAUserId,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'DRIVER',
    };
    const drvBHeaders = {
      'x-dev-user-id': drvBUserId,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'DRIVER',
    };

    // Two Chinthal employees + One Hayathnagar employee (unrelated commute for isolation assertions)
    const emp1Res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp1.cmt.${suffix}@sol.local`,
        phone: `+91-9611${suffix.slice(0, 5)}`,
        fullName: `Chinthal Commuter One ${suffix}`,
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `EC1-${suffix}`,
        department: 'Platform',
        pickupLocation: {
          locationName: 'Chinthal Bus Stop',
          address: 'Chinthal Main Road',
          corridorTag: 'Chintal',
          latitude: 17.4998,
          longitude: 78.4581,
        },
      })
      .expect(201);
    createdEmployeeIds.push(emp1Res.body.data.id as string);
    createdUserIds.push(emp1Res.body.data.userId as string);
    createdLocationIds.push(emp1Res.body.data.savedLocation.id as string);

    const emp2Res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp2.cmt.${suffix}@sol.local`,
        phone: `+91-9622${suffix.slice(0, 5)}`,
        fullName: `Chinthal Commuter Two ${suffix}`,
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `EC2-${suffix}`,
        department: 'Platform',
        pickupLocation: {
          locationName: 'IDPL Chinthal Circle',
          address: 'IDPL Main Road',
          corridorTag: 'Chinthal',
          latitude: 17.5021,
          longitude: 78.459,
        },
      })
      .expect(201);
    createdEmployeeIds.push(emp2Res.body.data.id as string);
    createdUserIds.push(emp2Res.body.data.userId as string);
    createdLocationIds.push(emp2Res.body.data.savedLocation.id as string);

    const empHayRes = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set({ ...adminHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        email: `emp.hay.cmt.${suffix}@sol.local`,
        phone: `+91-9633${suffix.slice(0, 5)}`,
        fullName: `Hayathnagar Isolated ${suffix}`,
        officeId: SEED_IDS.officeGachibowli,
        defaultShiftId: SEED_IDS.shiftMorningLogin,
        employeeCode: `EHY-${suffix}`,
        department: 'Support',
        pickupLocation: {
          locationName: 'Hayathnagar Bus Stand',
          address: 'NH65 Hayathnagar',
          corridorTag: 'Hayatnagar',
          latitude: 17.3266,
          longitude: 78.6062,
        },
      })
      .expect(201);
    createdEmployeeIds.push(empHayRes.body.data.id as string);
    createdUserIds.push(empHayRes.body.data.userId as string);
    createdLocationIds.push(empHayRes.body.data.savedLocation.id as string);

    const emp1Headers = {
      'x-dev-user-id': emp1Res.body.data.userId as string,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'EMPLOYEE',
    };
    const emp2Headers = {
      'x-dev-user-id': emp2Res.body.data.userId as string,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'EMPLOYEE',
    };
    const empHayHeaders = {
      'x-dev-user-id': empHayRes.body.data.userId as string,
      'x-dev-org-id': SEED_IDS.orgAcme,
      'x-dev-role': 'EMPLOYEE',
    };

    // Create 1-month recurring schedules in March 2027 (MON-FRI = 23 weekdays in March 2027)
    const s1Res = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...emp1Headers, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: emp1Res.body.data.savedLocation.id,
        direction: 'LOGIN',
        timePreference: 'ARRIVE_BY',
        requestedTimeLocal: '09:00',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'MONTHLY',
        startDate: '2027-03-01',
        selectedDaysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      })
      .expect(201);
    createdSeriesIds.push(s1Res.body.data.series.id as string);
    for (const b of s1Res.body.data.bookings as Array<{ id: string }>) createdBookingIds.push(b.id);

    const s2Res = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...emp2Headers, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: emp2Res.body.data.savedLocation.id,
        direction: 'LOGIN',
        timePreference: 'ARRIVE_BY',
        requestedTimeLocal: '09:00',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'MONTHLY',
        startDate: '2027-03-01',
        selectedDaysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      })
      .expect(201);
    createdSeriesIds.push(s2Res.body.data.series.id as string);
    for (const b of s2Res.body.data.bookings as Array<{ id: string }>) createdBookingIds.push(b.id);

    const sHayRes = await request(app.getHttpServer())
      .post('/api/v1/employee/bookings/series')
      .set({ ...empHayHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        shiftId: SEED_IDS.shiftMorningLogin,
        pickupLocationId: empHayRes.body.data.savedLocation.id,
        direction: 'LOGIN',
        timePreference: 'ARRIVE_BY',
        requestedTimeLocal: '09:00',
        timezone: 'Asia/Kolkata',
        recurrenceType: 'WEEKLY',
        startDate: '2027-03-01',
        selectedDaysOfWeek: ['MON', 'WED'],
      })
      .expect(201);
    createdSeriesIds.push(sHayRes.body.data.series.id as string);
    for (const b of sHayRes.body.data.bookings as Array<{ id: string }>) {
      createdBookingIds.push(b.id);
    }

    const chinthalCommuteKey = s1Res.body.data.series.commuteKey as string;
    expect(chinthalCommuteKey).toBe(s2Res.body.data.series.commuteKey);
    expect(chinthalCommuteKey).not.toBe(sHayRes.body.data.series.commuteKey);

    // 1. Operator Commute Workspace lists Chinthal's 46 monthly requests as ONE commute card
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/commutes?search=${encodeURIComponent(suffix)}&page=1&limit=10`)
      .set(approverHeaders)
      .expect(200);
    const listItems = listRes.body.data as Array<{
      commuteKey: string;
      employeeCount: number;
      scheduledDatesCount: number;
      counts: { pendingApproval: number };
    }>;
    const chinCard = listItems.find((i) => i.commuteKey === chinthalCommuteKey);
    expect(chinCard).toBeDefined();
    expect(chinCard!.employeeCount).toBe(2);
    expect(chinCard!.scheduledDatesCount).toBe(23);
    expect(chinCard!.counts.pendingApproval).toBe(46);

    // 2. Focused Commute Detail contains ONLY Chinthal employees & dates (zero Hayathnagar leakage)
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/commutes/${chinthalCommuteKey}`)
      .set(approverHeaders)
      .expect(200);
    const detailEmployees = detailRes.body.data.employees as Array<{ employeeId: string; localityName: string }>;
    expect(detailEmployees).toHaveLength(2);
    expect(detailEmployees.every((e) => e.localityName === 'Chinthal')).toBe(true);
    expect(
      detailEmployees.some((e) => e.employeeId === empHayRes.body.data.id),
    ).toBe(false);
    expect(detailRes.body.data.vehicleRequirements.peakDatePassengers).toBe(2);
    expect(detailRes.body.data.dates).toHaveLength(23);

    // 3. Operator approves all 23 dates of Chinthal commute cleanly
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/commutes/${chinthalCommuteKey}/approve-dates`)
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ decision: 'APPROVED', remarks: 'Approved Chinthal monthly plan' })
      .expect(201);
    expect(approveRes.body.data.decidedCount).toBe(46);

    // 4. Preview then Publish auto-allocation strictly scoped to Chinthal commute
    const previewAllocRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/commutes/${chinthalCommuteKey}/allocate-dates`)
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({ publish: false })
      .expect(201);
    expect(previewAllocRes.body.data.runId).toBeTruthy();
    createdRunIds.push(previewAllocRes.body.data.runId as string);
    expect(previewAllocRes.body.data.proposals).toHaveLength(23);
    // Scoped strictly to Chinthal commute: no Hayathnagar booking included
    const allocatedBookingIds = (
      previewAllocRes.body.data.proposals as Array<{ stops: Array<{ bookingId: string }> }>
    ).flatMap((p) => p.stops.map((s) => s.bookingId));
    expect(allocatedBookingIds).toHaveLength(46);

    // Force all 23 proposals onto Driver A so Driver A gets the full monthly schedule for calendar testing
    const forcedGroups = (
      previewAllocRes.body.data.proposals as Array<{
        clusterId: string;
        travelDate: string;
        shiftId: string;
        officeId: string;
        direction: 'LOGIN' | 'LOGOUT';
        plannedStartAt: string;
        plannedEndAt: string;
        primaryLocalityId: string | null;
        rationale: Record<string, unknown>;
        stops: Array<{ bookingId: string; sequenceNo: number; scheduledArrivalAt: string }>;
      }>
    ).map((p) => ({
      clusterId: p.clusterId,
      travelDate: p.travelDate,
      shiftId: p.shiftId,
      officeId: p.officeId,
      direction: p.direction,
      driverId: drvAId,
      vehicleId: vehAId,
      plannedStartAt: p.plannedStartAt,
      plannedEndAt: p.plannedEndAt,
      primaryLocalityId: p.primaryLocalityId,
      rationale: p.rationale,
      stops: p.stops.map((s) => ({
        bookingId: s.bookingId,
        sequenceNo: s.sequenceNo,
        scheduledArrivalAt: s.scheduledArrivalAt,
      })),
    }));

    const pubRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/commutes/${chinthalCommuteKey}/allocate-dates`)
      .set({ ...approverHeaders, 'x-idempotency-key': crypto.randomUUID() })
      .send({
        publish: true,
        runId: previewAllocRes.body.data.runId,
        groups: forcedGroups,
      })
      .expect(201);
    expect(pubRes.body.data.publishedCount).toBe(23);
    for (const item of pubRes.body.data.trips as Array<{ trip: { id: string } }>) {
      createdTripIds.push(item.trip.id);
    }

    // Check Driver A did NOT receive 23 separate DB notifications (1 consolidated notification per commute batch)
    const drvANotifs = await dbService.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, drvAUserId));
    expect(drvANotifs.length).toBeLessThanOrEqual(2);

    // 5. Driver A overview renders ONE compact commute card (not 23 cards!)
    const drvOverviewRes = await request(app.getHttpServer())
      .get('/api/v1/driver/commutes/overview')
      .set(drvAHeaders)
      .expect(200);
    const drvCommutes = drvOverviewRes.body.data.commutes as Array<{
      commuteId: string;
      commuteName: string;
      scheduledTripsCount: number;
    }>;
    expect(drvCommutes).toHaveLength(1);
    expect(drvCommutes[0].commuteName).toBe('Chinthal Morning Pickup');
    expect(drvCommutes[0].scheduledTripsCount).toBe(23);

    const drvCommuteId = drvCommutes[0].commuteId;

    // 6. Driver A monthly calendar lights up ONLY the 23 assigned dates (March 2027)
    const calBeforeRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/calendar?month=2027-03`)
      .set(drvAHeaders)
      .expect(200);
    const calDatesBefore = calBeforeRes.body.data.scheduledDates as Array<{
      date: string;
      primaryTripId: string;
    }>;
    expect(calDatesBefore).toHaveLength(23);
    const mar3Entry = calDatesBefore.find((d) => d.date === '2027-03-03')!;
    const mar4Entry = calDatesBefore.find((d) => d.date === '2027-03-04')!;

    // Selecting grey date (Saturday 2027-03-06) returns empty trips array cleanly
    const greyRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/dates/2027-03-06`)
      .set(drvAHeaders)
      .expect(200);
    expect(greyRes.body.data.trips).toHaveLength(0);

    // Selecting blue date returns full trip manifest scoped to Driver A
    const blueRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/dates/2027-03-03`)
      .set(drvAHeaders)
      .expect(200);
    expect(blueRes.body.data.trips).toHaveLength(1);
    expect(blueRes.body.data.trips[0].stops.length).toBeGreaterThanOrEqual(2);

    // 7. Reassign March 3 to Driver B -> turns March 3 GREY on Driver A & BLUE on Driver B!
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/dispatch/${mar3Entry.primaryTripId}/modify`)
      .set(approverHeaders)
      .send({
        driverId: drvBId,
        vehicleId: vehBId,
        reason: 'Driver A vehicle maintenance on Mar 3',
      })
      .expect(200);

    // 8. Cancel March 4 trip -> turns March 4 GREY on Driver A as well!
    await dbService.db
      .update(trips)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(and(eq(trips.id, mar4Entry.primaryTripId)));

    const calAfterRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/calendar?month=2027-03`)
      .set(drvAHeaders)
      .expect(200);
    const calDatesAfter = calAfterRes.body.data.scheduledDates as Array<{ date: string }>;
    expect(calDatesAfter).toHaveLength(21);
    expect(calDatesAfter.some((d) => d.date === '2027-03-03')).toBe(false);
    expect(calDatesAfter.some((d) => d.date === '2027-03-04')).toBe(false);

    // Driver B calendar now shows March 3 as assigned!
    const calBRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/calendar?month=2027-03`)
      .set(drvBHeaders)
      .expect(200);
    expect((calBRes.body.data.scheduledDates as Array<{ date: string }>).map((d) => d.date)).toEqual([
      '2027-03-03',
    ]);

    // Driver B cannot inspect Driver A's unassigned date (2027-03-01) -> returns 0 trips!
    const crossDriverDateRes = await request(app.getHttpServer())
      .get(`/api/v1/driver/commutes/${drvCommuteId}/dates/2027-03-01`)
      .set(drvBHeaders)
      .expect(200);
    expect(crossDriverDateRes.body.data.trips).toHaveLength(0);
  });
});
