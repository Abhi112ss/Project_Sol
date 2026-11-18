import crypto from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/infrastructure/database/database.service.js';
import {
  employees,
  idempotencyKeys,
  memberships,
  users,
} from '../src/infrastructure/database/schema/index.js';
import { SEED_IDS } from '../src/infrastructure/database/seed-constants.js';

describe('Central Transport Core (Phase 1 E2E Integration)', () => {
  let app: INestApplication<App>;
  let dbService: DatabaseService;

  const orgAdminHeaders = {
    'x-dev-user-id': SEED_IDS.userOrgAdmin,
    'x-dev-org-id': SEED_IDS.orgAcme,
    'x-dev-role': 'ORG_ADMIN',
  };

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
    await app.close();
  });

  it('GET /api/v1 returns service metadata in standard envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('Project Sol — Central Transport Core');
    expect(res.body.meta.requestId).toBeTruthy();
    expect(res.body.error).toBeNull();
  });

  it('GET /api/v1/health/ready verifies live PostgreSQL, PostGIS, and Redis', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.postgres.ok).toBe(true);
    expect(res.body.data.dependencies.postgis.ok).toBe(true);
    expect(res.body.data.dependencies.redis.ok).toBe(true);
  });

  it('GET /api/v1/meta/enums exposes canonical states and roles', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/meta/enums').expect(200);
    expect(res.body.data.roles).toContain('DUTY_APPROVER');
    expect(res.body.data.tripStatuses).toContain('IN_PROGRESS');
    expect(res.body.data.passengerStatuses).toContain('NO_SHOW');
  });

  it('enforces multi-tenant and identity header boundaries on admin routes', async () => {
    const unauth = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .expect(401);
    expect(unauth.body.success).toBe(false);
    expect(unauth.body.error.code).toBe('UNAUTHORIZED');

    const ok = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .set(orgAdminHeaders)
      .expect(200);
    expect(ok.body.data).toHaveLength(1);
    expect(ok.body.data[0].slug).toBe('acme-hyderabad');

    const crossTenant = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .set(orgAdminHeaders)
      .expect(403);
    expect(crossTenant.body.error.code).toBe('TENANT_FORBIDDEN');
  });

  it('validates payloads via StandardSchemaValidationPipe (Zod)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/employees')
      .set(orgAdminHeaders)
      .send({ email: 'not-an-email', employeeCode: 'X' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates an employee + PostGIS saved location idempotently and cleans up', async () => {
    const idemKey = crypto.randomUUID();
    const testEmail = `e2e.${Date.now()}@acme-hyd.local`;
    const payload = {
      email: testEmail,
      phone: '+91-9000099999',
      fullName: 'E2E Test Employee',
      officeId: SEED_IDS.officeGachibowli,
      defaultShiftId: SEED_IDS.shiftMorningLogin,
      employeeCode: `EMP-E2E-${Date.now()}`,
      department: 'QA Engineering',
      pickupLocation: {
        locationName: 'Test Madhapur Pin',
        address: 'Hitec City Road, Madhapur, Hyderabad',
        corridorTag: 'Madhapur',
        latitude: 17.4483,
        longitude: 78.3915,
        geofenceRadiusM: 150,
      },
    };

    try {
      const first = await request(app.getHttpServer())
        .post('/api/v1/admin/employees')
        .set({ ...orgAdminHeaders, 'x-idempotency-key': idemKey })
        .send(payload)
        .expect(201);

      expect(first.body.data.savedLocation.corridorTag).toBe('Madhapur');

      const replay = await request(app.getHttpServer())
        .post('/api/v1/admin/employees')
        .set({ ...orgAdminHeaders, 'x-idempotency-key': idemKey })
        .send(payload)
        .expect(201);

      expect(replay.body.data.id).toBe(first.body.data.id);

      await request(app.getHttpServer())
        .post('/api/v1/admin/employees')
        .set({ ...orgAdminHeaders, 'x-idempotency-key': idemKey })
        .send({ ...payload, fullName: 'Tampered Name' })
        .expect(409);

      const distance = await dbService.computeDistanceMeters(
        17.4849,
        78.4138,
        17.4401,
        78.3489,
      );
      expect(distance).toBeGreaterThan(7500);
      expect(distance).toBeLessThan(9500);
    } finally {
      await dbService.db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.idempotencyKey, idemKey));
      const [createdUser] = await dbService.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, testEmail))
        .limit(1);
      if (createdUser) {
        await dbService.db.delete(employees).where(eq(employees.userId, createdUser.id));
        await dbService.db.delete(memberships).where(eq(memberships.userId, createdUser.id));
        await dbService.db.delete(users).where(eq(users.id, createdUser.id));
      }
    }
  });
});
