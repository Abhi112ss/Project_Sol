import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { SafetyService } from './safety.service.js';

@Processor(QUEUE_NAMES.SCHEDULED_JOBS)
export class SafetyProcessor extends WorkerHost {
  constructor(private readonly safetyService: SafetyService) {
    super();
  }

  async process(job: Job<{ organizationId?: string }>): Promise<unknown> {
    if (job.name === 'scan-safety-overdue') {
      return this.safetyService.scanOverdueSafeReach(job.data?.organizationId);
    }
    return { ignored: job.name };
  }
}

