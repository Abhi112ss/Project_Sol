import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { QUEUE_NAMES } from './queue.constants.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: {
          host: config.redisHost,
          port: config.redisPort,
          password: config.redisPassword || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: 500,
          removeOnFail: 1000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.TRIP_REMINDERS },
      { name: QUEUE_NAMES.ETA_CALCULATIONS },
      { name: QUEUE_NAMES.LOCATION_PROCESSING },
      { name: QUEUE_NAMES.REPORTS },
      { name: QUEUE_NAMES.SCHEDULED_JOBS },
      { name: QUEUE_NAMES.VENDOR_RECONCILIATION },
      { name: QUEUE_NAMES.BOOKING_MAINTENANCE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

