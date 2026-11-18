import { Injectable } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import { DatabaseService, type SolTransaction } from '../database/database.service.js';
import { outboxEvents } from '../database/schema/index.js';
import type { TransportTopic } from './topics.js';

export interface OutboxRecordInput {
  organizationId: string;
  topic: TransportTopic;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Persists domain events into PostgreSQL outbox_events within the same ACID
 * transaction as business mutations. Ready for BullMQ today and Kafka later.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly dbService: DatabaseService) {}

  async enqueueInTx(tx: SolTransaction, input: OutboxRecordInput): Promise<string> {
    const [inserted] = await tx
      .insert(outboxEvents)
      .values({
        organizationId: input.organizationId,
        topic: input.topic,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payloadJson: input.payload,
      })
      .returning({ id: outboxEvents.id });
    return inserted.id;
  }

  async fetchPending(limit = 50) {
    return this.dbService.db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .limit(limit);
  }

  async markPublished(eventId: string): Promise<void> {
    await this.dbService.db
      .update(outboxEvents)
      .set({ publishedAt: new Date() })
      .where(eq(outboxEvents.id, eventId));
  }
}

