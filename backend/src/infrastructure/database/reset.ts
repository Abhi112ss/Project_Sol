import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadBackendEnv } from './env-loader.js';
import { runSeed } from './seed.js';

loadBackendEnv();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing db:reset in production environment.');
}

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sol_admin:sol_dev_pg_pass@127.0.0.1:5433/transport_dev';

async function resetDatabase(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    await db.execute(sql`
      TRUNCATE TABLE
        outbox_events,
        idempotency_keys,
        invoices,
        audit_logs,
        safety_alerts,
        notifications,
        otp_records,
        no_show_records,
        gps_locations,
        trip_events,
        passenger_assignments,
        trip_stops,
        trips,
        allocation_runs,
        approvals,
        bookings,
        booking_series,
        employee_locations,
        employees,
        drivers,
        vehicles,
        shifts,
        memberships,
        offices,
        vendors,
        localities,
        users,
        organization_settings,
        organizations
      RESTART IDENTITY CASCADE;
    `);
    console.log('[db:reset] Truncated development tables safely.');
  } finally {
    await pool.end();
  }
  await runSeed();
}

resetDatabase().catch((err) => {
  console.error('[db:reset] Failed:', err);
  process.exitCode = 1;
});
