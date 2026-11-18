import crypto from 'node:crypto';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Observable, mergeMap, of } from 'rxjs';
import { DatabaseService } from '../database/database.service.js';
import { idempotencyKeys } from '../database/schema/index.js';
import type { RequestIdentity } from './current-user.decorator.js';

export const IDEMPOTENT_KEY = 'sol_idempotent';
export const Idempotent = (options: { required?: boolean } = {}) =>
  SetMetadata(IDEMPOTENT_KEY, { required: options.required ?? false });

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly dbService: DatabaseService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<{ required: boolean } | undefined>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) {
      return next.handle();
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { identity?: RequestIdentity }>();
    const res = context.switchToHttp().getResponse<Response>();
    const rawKey = req.header('x-idempotency-key')?.trim();

    if (!rawKey) {
      if (meta.required) {
        throw new BadRequestException({
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'X-Idempotency-Key header is required for this mutation.',
        });
      }
      return next.handle();
    }

    const orgId = req.identity?.organizationId;
    if (!orgId) {
      return next.handle();
    }

    const requestHash = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.path}:${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    const [existing] = await this.dbService.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.organizationId, orgId),
          eq(idempotencyKeys.idempotencyKey, rawKey),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
          message: 'X-Idempotency-Key was already used with a different request payload.',
        });
      }
      res.status(existing.statusCode);
      return of(existing.responseJson);
    }

    return next.handle().pipe(
      mergeMap(async (responseBody) => {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.dbService.db
          .insert(idempotencyKeys)
          .values({
            organizationId: orgId,
            idempotencyKey: rawKey,
            requestMethod: req.method,
            requestPath: req.path,
            requestHash,
            statusCode: res.statusCode || 200,
            responseJson: responseBody ?? null,
            expiresAt,
          })
          .onConflictDoNothing();
        return responseBody;
      }),
    );
  }
}
