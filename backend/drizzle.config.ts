import { defineConfig } from 'drizzle-kit';
import { loadBackendEnv } from './src/infrastructure/database/env-loader.js';

loadBackendEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://sol_admin:sol_dev_pg_pass@127.0.0.1:5433/transport_dev',
  },
  verbose: true,
  strict: true,
});
