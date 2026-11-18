import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().min(1).default('api/v1'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://sol_admin:sol_dev_pg_pass@127.0.0.1:5433/transport_dev'),
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default('sol_dev_redis_pass'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((v) => v !== 'false')
    .default(true),
  OSM_TILE_URL: z.string().url().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  REDIS_LIVE_LOCATION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(180),
});

export type AppEnv = z.infer<typeof envSchema>;
