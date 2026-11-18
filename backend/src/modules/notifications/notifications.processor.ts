import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import type { NotificationDispatchJob, TripReminderJob } from './notifications.schemas.js';
import { NotificationsService } from './notifications.service.js';

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly service: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationDispatchJob>): Promise<unknown> {
    return this.service.dispatchNotificationJob(job.data);
  }
}

@Processor(QUEUE_NAMES.TRIP_REMINDERS)
export class TripRemindersProcessor extends WorkerHost {
  constructor(private readonly service: NotificationsService) {
    super();
  }

  async process(job: Job<TripReminderJob>): Promise<unknown> {
    return this.service.processTripReminderJob(job.data);
  }
}

