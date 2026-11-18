import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/roles.decorator.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  live() {
    return {
      status: 'ok',
      service: 'central-transport-core',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Dependency readiness check (PostgreSQL + PostGIS + Redis)' })
  async ready() {
    let postgisVersion: string | null = null;
    let postgresOk = false;
    let redisOk = false;

    try {
      const dbHealth = await this.dbService.checkHealth();
      postgresOk = dbHealth.ok;
      postgisVersion = dbHealth.postgisVersion;
    } catch {
      postgresOk = false;
    }

    try {
      const pong = await this.redisService.ping();
      redisOk = pong === 'PONG';
    } catch {
      redisOk = false;
    }

    const payload = {
      status: postgresOk && redisOk ? 'ready' : 'degraded',
      dependencies: {
        postgres: { ok: postgresOk },
        postgis: { ok: Boolean(postgisVersion), version: postgisVersion },
        redis: { ok: redisOk },
      },
    };

    if (!postgresOk || !redisOk) {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'One or more infrastructure dependencies failed readiness checks.',
        details: payload,
      });
    }

    return payload;
  }

  @Get()
  @ApiOperation({ summary: 'Combined health overview' })
  async summary() {
    return this.ready();
  }
}

