import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { AppConfigService } from '../config/app-config.service.js';
import * as schema from './schema/index.js';

export type SolDatabase = NodePgDatabase<typeof schema>;
export type SolTransaction = Parameters<Parameters<SolDatabase['transaction']>[0]>[0];

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: SolDatabase;

  constructor(private readonly config: AppConfigService) {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
      max: 15,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(fn: (tx: SolTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async checkHealth(): Promise<{ ok: boolean; postgisVersion: string | null }> {
    const result = await this.db.execute(sql`SELECT PostGIS_Version() AS version`);
    const first = result.rows[0] as { version?: string } | undefined;
    return {
      ok: Boolean(first?.version),
      postgisVersion: first?.version ?? null,
    };
  }

  /**
   * Computes exact metric geodesic distance on WGS84 spheroid via PostGIS.
   */
  async computeDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${lng1}, ${lat1}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng2}, ${lat2}), 4326)::geography
      ) AS distance_m
    `);
    const row = result.rows[0] as { distance_m?: number | string } | undefined;
    return Number(row?.distance_m ?? 0);
  }
}

