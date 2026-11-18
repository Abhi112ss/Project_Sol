import { Global, Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ApiEnvelopeInterceptor } from './envelope.interceptor.js';
import { GlobalExceptionFilter } from './http-exception.filter.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { RequestContextGuard } from './request-context.guard.js';

@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: RequestContextGuard },
    {
      provide: APP_PIPE,
      useFactory: () => new StandardSchemaValidationPipe({ transform: true }),
    },
    { provide: APP_INTERCEPTOR, useClass: ApiEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class CommonModule {}
