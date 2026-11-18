import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from './env.schema.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get host(): string {
    return this.config.get('HOST', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get apiPrefix(): string {
    return this.config.get('API_PREFIX', { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisHost(): string {
    return this.config.get('REDIS_HOST', { infer: true });
  }

  get redisPort(): number {
    return this.config.get('REDIS_PORT', { infer: true });
  }

  get redisPassword(): string {
    return this.config.get('REDIS_PASSWORD', { infer: true });
  }

  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get isDevAuthBypassEnabled(): boolean {
    return this.nodeEnv !== 'production' && this.config.get('DEV_AUTH_BYPASS', { infer: true });
  }

  get liveLocationTtlSeconds(): number {
    return this.config.get('REDIS_LIVE_LOCATION_TTL_SECONDS', { infer: true });
  }
}

