import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedPayload<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function isPaginatedPayload<T>(value: unknown): value is PaginatedPayload<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PaginatedPayload<T>).items) &&
    typeof (value as PaginatedPayload<T>).pagination === 'object'
  );
}

@Injectable()
export class ApiEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? req.header('x-correlation-id') ?? crypto.randomUUID();
    req.requestId = requestId;

    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload instanceof StreamableFile) {
          return payload;
        }
        if (isPaginatedPayload(payload)) {
          return {
            success: true,
            data: payload.items,
            meta: {
              requestId,
              serverTime: new Date().toISOString(),
              pagination: payload.pagination,
            },
            error: null,
          };
        }

        return {
          success: true,
          data: payload ?? null,
          meta: {
            requestId,
            serverTime: new Date().toISOString(),
          },
          error: null,
        };
      }),
    );
  }
}

