import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadBackendEnv } from './env-loader.js';
import { buildOperatorCommuteIdentity } from '../../modules/commutes/commutes.utils.js';
import { SEED_IDS } from './seed-constants.js';
import * as schema from './schema/index.js';

export { SEED_IDS };

loadBackendEnv();

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sol_admin:sol_dev_pg_pass@127.0.0.1:5433/transport_dev';

export async function runSeed(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    await db
      .insert(schema.organizations)
      .values({
        id: SEED_IDS.orgAcme,
        name: 'Acme Hyderabad Tech Ops (Synthetic)',
        slug: 'acme-hyderabad',
        status: 'ACTIVE',
        countryCode: 'IN',
        timezone: 'Asia/Kolkata',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.organizationSettings)
      .values({
        organizationId: SEED_IDS.orgAcme,
        defaultGeofenceRadiusM: 150,
        noShowWaitSeconds: 300,
        bookingCutoffMinutes: 120,
        cancellationCutoffMinutes: 45,
        requireBoardingOtp: true,
        requireDeboardingOtp: false,
        gpsStaleThresholdSeconds: 60,
        gpsRetentionDays: 90,
        gpsPingIntervalSeconds: 15,
        currencyCode: 'INR',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.offices)
      .values({
        id: SEED_IDS.officeGachibowli,
        organizationId: SEED_IDS.orgAcme,
        name: 'Gachibowli Campus',
        code: 'HYD-GCB-01',
        address: 'Financial District, Gachibowli, Hyderabad 500032',
        latitude: 17.4401,
        longitude: 78.3489,
        location: { x: 78.3489, y: 17.4401 },
        geofenceRadiusM: 250,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.localities)
      .values([
        {
          id: SEED_IDS.localityKukatpally,
          organizationId: SEED_IDS.orgAcme,
          canonicalName: 'Kukatpally',
          normalizedSlug: 'kukatpally',
          aliases: ['Kukatpally', 'KPHB', 'KPHB Colony', 'Kukatpally Metro'],
          centerLatitude: 17.4849,
          centerLongitude: 78.4138,
          centerPoint: { x: 78.4138, y: 17.4849 },
          proximityRadiusM: 3500,
        },
        {
          id: SEED_IDS.localityMiyapur,
          organizationId: SEED_IDS.orgAcme,
          canonicalName: 'Miyapur',
          normalizedSlug: 'miyapur',
          aliases: ['Miyapur', 'Miyapur X Roads', 'Miyapur Cross'],
          centerLatitude: 17.4968,
          centerLongitude: 78.3614,
          centerPoint: { x: 78.3614, y: 17.4968 },
          proximityRadiusM: 3500,
        },
        {
          id: SEED_IDS.localityAmeerpet,
          organizationId: SEED_IDS.orgAcme,
          canonicalName: 'Ameerpet',
          normalizedSlug: 'ameerpet',
          aliases: ['Ameerpet', 'SR Nagar', 'Ameerpet Metro'],
          centerLatitude: 17.4375,
          centerLongitude: 78.4483,
          centerPoint: { x: 78.4483, y: 17.4375 },
          proximityRadiusM: 3500,
        },
        {
          id: SEED_IDS.localityChinthal,
          organizationId: SEED_IDS.orgAcme,
          canonicalName: 'Chinthal',
          normalizedSlug: 'chinthal',
          aliases: ['Chinthal', 'Chintal', 'Chinthal X Road', 'IDPL Chinthal'],
          centerLatitude: 17.4998,
          centerLongitude: 78.4581,
          centerPoint: { x: 78.4581, y: 17.4998 },
          proximityRadiusM: 3500,
        },
        {
          id: SEED_IDS.localityHayathnagar,
          organizationId: SEED_IDS.orgAcme,
          canonicalName: 'Hayathnagar',
          normalizedSlug: 'hayathnagar',
          aliases: ['Hayathnagar', 'Hayatnagar', 'Hayath Nagar'],
          centerLatitude: 17.3266,
          centerLongitude: 78.6062,
          centerPoint: { x: 78.6062, y: 17.3266 },
          proximityRadiusM: 4500,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.vendors)
      .values({
        id: SEED_IDS.vendorSwiftCab,
        organizationId: SEED_IDS.orgAcme,
        name: 'Deccan Fleet Partners (Synthetic)',
        code: 'DECCAN-01',
        contactName: 'Srinivas Rao',
        contactPhone: '+91-9000000101',
        billingBaseTripPaise: 45000,
        billingRatePerKmPaise: 1800,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.shifts)
      .values([
        {
          id: SEED_IDS.shiftMorningLogin,
          organizationId: SEED_IDS.orgAcme,
          officeId: SEED_IDS.officeGachibowli,
          name: 'Morning Login S1',
          code: 'S1-LOGIN-0900',
          direction: 'LOGIN',
          shiftTimeLocal: '09:00',
          daysOfWeek: 'MON,TUE,WED,THU,FRI',
        },
        {
          id: SEED_IDS.shiftEveningLogout,
          organizationId: SEED_IDS.orgAcme,
          officeId: SEED_IDS.officeGachibowli,
          name: 'Evening Logout S2',
          code: 'S2-LOGOUT-1830',
          direction: 'LOGOUT',
          shiftTimeLocal: '18:30',
          daysOfWeek: 'MON,TUE,WED,THU,FRI',
        },
      ])
      .onConflictDoNothing();

    const seedUsers = [
      {
        id: SEED_IDS.userSuperAdmin,
        email: 'superadmin@soltransit.local',
        phone: '+91-9000000001',
        fullName: 'Vikramaditya Nair (Platform Admin)',
      },
      {
        id: SEED_IDS.userOrgAdmin,
        email: 'orgadmin@acme-hyd.local',
        phone: '+91-9000000002',
        fullName: 'Ananya Reddy (Org Admin)',
      },
      {
        id: SEED_IDS.userDutyApprover,
        email: 'dispatcher@acme-hyd.local',
        phone: '+91-9000000003',
        fullName: 'Karthik Sharma (Duty Approver)',
      },
      {
        id: SEED_IDS.userTransportManager,
        email: 'manager@acme-hyd.local',
        phone: '+91-9000000004',
        fullName: 'Meera Iyer (Transport Manager)',
      },
      {
        id: SEED_IDS.userVendorSupervisor,
        email: 'vendor@deccanfleet.local',
        phone: '+91-9000000005',
        fullName: 'Srinivas Rao (Vendor Supervisor)',
      },
      {
        id: SEED_IDS.userAuditor,
        email: 'auditor@acme-hyd.local',
        phone: '+91-9000000006',
        fullName: 'Deepa Menon (Auditor)',
      },
      {
        id: SEED_IDS.userDriverRamesh,
        email: 'ramesh.driver@deccanfleet.local',
        phone: '+91-9000000011',
        fullName: 'Ramesh Kumar (Driver)',
      },
      {
        id: SEED_IDS.userEmpAarav,
        email: 'aarav.patel@acme-hyd.local',
        phone: '+91-9000000021',
        fullName: 'Aarav Patel',
      },
      {
        id: SEED_IDS.userEmpPriya,
        email: 'priya.nair@acme-hyd.local',
        phone: '+91-9000000022',
        fullName: 'Priya Nair',
      },
      {
        id: SEED_IDS.userEmpKiran,
        email: 'kiran.varma@acme-hyd.local',
        phone: '+91-9000000023',
        fullName: 'Kiran Varma',
      },
    ];

    await db.insert(schema.users).values(seedUsers).onConflictDoNothing();

    await db
      .insert(schema.memberships)
      .values([
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userSuperAdmin,
          role: 'PLATFORM_SUPER_ADMIN',
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userOrgAdmin,
          role: 'ORG_ADMIN',
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userDutyApprover,
          role: 'DUTY_APPROVER',
          officeId: SEED_IDS.officeGachibowli,
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userTransportManager,
          role: 'TRANSPORT_MANAGER',
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userVendorSupervisor,
          role: 'VENDOR_SUPERVISOR',
          vendorId: SEED_IDS.vendorSwiftCab,
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userAuditor,
          role: 'AUDITOR',
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userDriverRamesh,
          role: 'DRIVER',
          vendorId: SEED_IDS.vendorSwiftCab,
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpAarav,
          role: 'EMPLOYEE',
          officeId: SEED_IDS.officeGachibowli,
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpPriya,
          role: 'EMPLOYEE',
          officeId: SEED_IDS.officeGachibowli,
        },
        {
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpKiran,
          role: 'EMPLOYEE',
          officeId: SEED_IDS.officeGachibowli,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.vehicles)
      .values({
        id: SEED_IDS.vehicleDzire,
        organizationId: SEED_IDS.orgAcme,
        vendorId: SEED_IDS.vendorSwiftCab,
        registrationNo: 'TS 07 UA 4821',
        modelName: 'Maruti Dzire Tour S',
        vehicleType: 'SEDAN',
        seatingCapacity: 4,
        availabilityStatus: 'AVAILABLE',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.drivers)
      .values({
        id: SEED_IDS.driverRamesh,
        organizationId: SEED_IDS.orgAcme,
        userId: SEED_IDS.userDriverRamesh,
        vendorId: SEED_IDS.vendorSwiftCab,
        assignedVehicleId: SEED_IDS.vehicleDzire,
        baseLocalityId: SEED_IDS.localityKukatpally,
        baseLocalityName: 'Kukatpally',
        baseLatitude: 17.4849,
        baseLongitude: 78.4138,
        baseLocation: { x: 78.4138, y: 17.4849 },
        driverCode: 'DRV-HYD-001',
        licenseNo: 'TS0720190048112',
        availabilityStatus: 'AVAILABLE',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.employees)
      .values([
        {
          id: SEED_IDS.empAarav,
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpAarav,
          officeId: SEED_IDS.officeGachibowli,
          defaultShiftId: SEED_IDS.shiftMorningLogin,
          employeeCode: 'EMP-1001',
          department: 'Platform Engineering',
          emergencyContactName: 'Sunita Patel',
          emergencyContactPhone: '+91-9000001021',
        },
        {
          id: SEED_IDS.empPriya,
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpPriya,
          officeId: SEED_IDS.officeGachibowli,
          defaultShiftId: SEED_IDS.shiftMorningLogin,
          employeeCode: 'EMP-1002',
          department: 'Customer Operations',
          emergencyContactName: 'Rajesh Nair',
          emergencyContactPhone: '+91-9000001022',
        },
        {
          id: SEED_IDS.empKiran,
          organizationId: SEED_IDS.orgAcme,
          userId: SEED_IDS.userEmpKiran,
          officeId: SEED_IDS.officeGachibowli,
          defaultShiftId: SEED_IDS.shiftMorningLogin,
          employeeCode: 'EMP-1003',
          department: 'Cloud Infrastructure',
          emergencyContactName: 'Lakshmi Varma',
          emergencyContactPhone: '+91-9000001023',
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.employeeLocations)
      .values([
        {
          id: SEED_IDS.locKukatpally,
          organizationId: SEED_IDS.orgAcme,
          employeeId: SEED_IDS.empAarav,
          locationName: 'Home - Kukatpally Metro',
          address: 'Phase 1, KPHB Colony, Kukatpally, Hyderabad 500072',
          corridorTag: 'Kukatpally',
          localityId: SEED_IDS.localityKukatpally,
          normalizedLocality: 'Kukatpally',
          latitude: 17.4849,
          longitude: 78.4138,
          location: { x: 78.4138, y: 17.4849 },
          geofenceRadiusM: 150,
          isDefault: true,
          verified: true,
        },
        {
          id: SEED_IDS.locMiyapur,
          organizationId: SEED_IDS.orgAcme,
          employeeId: SEED_IDS.empPriya,
          locationName: 'Home - Miyapur X Roads',
          address: 'Allwyn Colony Road, Miyapur, Hyderabad 500049',
          corridorTag: 'Miyapur',
          localityId: SEED_IDS.localityMiyapur,
          normalizedLocality: 'Miyapur',
          latitude: 17.4968,
          longitude: 78.3614,
          location: { x: 78.3614, y: 17.4968 },
          geofenceRadiusM: 150,
          isDefault: true,
          verified: true,
        },
        {
          id: SEED_IDS.locAmeerpet,
          organizationId: SEED_IDS.orgAcme,
          employeeId: SEED_IDS.empKiran,
          locationName: 'Home - Ameerpet Metro Gate B',
          address: 'SR Nagar Main Road, Ameerpet, Hyderabad 500038',
          corridorTag: 'Ameerpet',
          localityId: SEED_IDS.localityAmeerpet,
          normalizedLocality: 'Ameerpet',
          latitude: 17.4375,
          longitude: 78.4483,
          location: { x: 78.4483, y: 17.4375 },
          geofenceRadiusM: 150,
          isDefault: true,
          verified: true,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(schema.bookings)
      .values([
        {
          id: SEED_IDS.bookingAarav,
          organizationId: SEED_IDS.orgAcme,
          commuteKey: buildOperatorCommuteIdentity({
            officeId: SEED_IDS.officeGachibowli,
            officeName: 'Gachibowli Campus',
            shiftId: SEED_IDS.shiftMorningLogin,
            shiftName: 'Morning Login S1',
            direction: 'LOGIN',
            localityLabel: 'Kukatpally',
            timePreference: 'PICKUP_AT',
            requestedTimeLocal: '08:05',
          }).commuteKey,
          employeeId: SEED_IDS.empAarav,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: SEED_IDS.locKukatpally,
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          timePreference: 'PICKUP_AT',
          requestedTimeLocal: '08:05',
          timezone: 'Asia/Kolkata',
          requestedPickupAt: new Date('2026-11-17T02:35:00.000Z'),
          scheduledPickupAt: new Date('2026-11-17T02:35:00.000Z'), // 08:05 IST
          status: 'PENDING_APPROVAL',
          notes: 'Synthetic shift demo booking (Kukatpally corridor)',
        },
        {
          id: SEED_IDS.bookingPriya,
          organizationId: SEED_IDS.orgAcme,
          commuteKey: buildOperatorCommuteIdentity({
            officeId: SEED_IDS.officeGachibowli,
            officeName: 'Gachibowli Campus',
            shiftId: SEED_IDS.shiftMorningLogin,
            shiftName: 'Morning Login S1',
            direction: 'LOGIN',
            localityLabel: 'Miyapur',
            timePreference: 'PICKUP_AT',
            requestedTimeLocal: '08:15',
          }).commuteKey,
          employeeId: SEED_IDS.empPriya,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: SEED_IDS.locMiyapur,
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          timePreference: 'PICKUP_AT',
          requestedTimeLocal: '08:15',
          timezone: 'Asia/Kolkata',
          requestedPickupAt: new Date('2026-11-17T02:45:00.000Z'),
          scheduledPickupAt: new Date('2026-11-17T02:45:00.000Z'), // 08:15 IST
          status: 'PENDING_APPROVAL',
          notes: 'Synthetic shift demo booking (Miyapur corridor)',
        },
        {
          id: SEED_IDS.bookingKiran,
          organizationId: SEED_IDS.orgAcme,
          commuteKey: buildOperatorCommuteIdentity({
            officeId: SEED_IDS.officeGachibowli,
            officeName: 'Gachibowli Campus',
            shiftId: SEED_IDS.shiftMorningLogin,
            shiftName: 'Morning Login S1',
            direction: 'LOGIN',
            localityLabel: 'Ameerpet',
            timePreference: 'PICKUP_AT',
            requestedTimeLocal: '08:30',
          }).commuteKey,
          employeeId: SEED_IDS.empKiran,
          shiftId: SEED_IDS.shiftMorningLogin,
          officeId: SEED_IDS.officeGachibowli,
          pickupLocationId: SEED_IDS.locAmeerpet,
          travelDate: '2026-11-17',
          direction: 'LOGIN',
          timePreference: 'PICKUP_AT',
          requestedTimeLocal: '08:30',
          timezone: 'Asia/Kolkata',
          requestedPickupAt: new Date('2026-11-17T03:00:00.000Z'),
          scheduledPickupAt: new Date('2026-11-17T03:00:00.000Z'), // 08:30 IST
          status: 'PENDING_APPROVAL',
          notes: 'Synthetic shift demo booking (Ameerpet corridor)',
        },
      ])
      .onConflictDoNothing();

    const existing = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, SEED_IDS.orgAcme));

    console.log(
      `[db:seed] Synthetic Hyderabad baseline verified (org=${existing[0]?.id ?? 'missing'})`,
    );
  } finally {
    await pool.end();
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  runSeed().catch((err) => {
    console.error('[db:seed] Failed:', err);
    process.exitCode = 1;
  });
}
