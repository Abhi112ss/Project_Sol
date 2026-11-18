import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadBackendEnv } from './env-loader.js';
import * as schema from './schema/index.js';

loadBackendEnv();

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://sol_admin:sol_dev_pg_pass@127.0.0.1:5433/transport_dev';

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    const db = drizzle(pool, { schema });
    const migrationsFolder = path.resolve(import.meta.dirname, '../../../drizzle');
    await migrate(db, { migrationsFolder });
    console.log(`[db:migrate] Applied migrations from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[db:migrate] Failed:', err);
  process.exitCode = 1;
});
