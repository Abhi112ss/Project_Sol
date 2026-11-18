import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import {
  buildPaginationMeta,
  type PaginationQuery,
} from '../../infrastructure/common/pagination.schema.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  notifications,
  passengerAssignments,
  trips,
  tripStops,
  employees,
} from '../../infrastructure/database/schema/index.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import type {
  NotificationDispatchJob,
  RegisterDeviceTokenDto,
  TripReminderJob,
} from './notifications.schemas.js';

const DEVICE_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEDUP_TTL_SECONDS = 24 * 60 * 60;
const PRE_PICKUP_REMINDER_LEAD_MS = 15 * 60 * 1000;

function pushTokensRedisKey(orgId: string, userId: string): string {
  return `transport:org:${orgId}:user:${userId}:push-tokens`;
}

function dedupRedisKey(dedupKey: string): string {
  return `transport:notif:dedup:${dedupKey}`;
}

export interface PushDispatchReceipt {
  attemptedTokens: number;
  mode: 'FCM_WEBHOOK' | 'LOCAL_DEV_SINK' | 'NO_TOKENS';
}

/**
 * Pluggable remote push dispatcher. When `FCM_WEBHOOK_URL` is configured,
 * posts push envelopes; otherwise records local diagnostic traces cleanly
 * under the zero-cost budget policy without failing local operations.
 */
@Injectable()
export class FcmAdapterService {
  private readonly logger = new Logger(FcmAdapterService.name);
  private readonly webhookUrl = process.env.FCM_WEBHOOK_URL?.trim() || null;

  async sendToTokens(
    tokens: Array<{ token: string; platform: string }>,
    payload: {
      title: string;
      body: string;
      category: string;
      data?: Record<string, unknown>;
    },
  ): Promise<PushDispatchReceipt> {
    if (tokens.length === 0) {
      return { attemptedTokens: 0, mode: 'NO_TOKENS' };
    }

    if (this.webhookUrl) {
      try {
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: tokens.map((t) => t.token),
            notification: { title: payload.title, body: payload.body },
            data: { category: payload.category, ...payload.data },
          }),
        });
        return { attemptedTokens: tokens.length, mode: 'FCM_WEBHOOK' };
      } catch (err) {
        this.logger.warn(`FCM webhook dispatch non-fatal failure: ${(err as Error).message}`);
      }
    }

    this.logger.debug(
      `[FCM_LOCAL_FALLBACK] ${tokens.length} token(s) | ${payload.category}: ${payload.title}`,
    );
    return { attemptedTokens: tokens.length, mode: 'LOCAL_DEV_SINK' };
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly redis: RedisService,
    private readonly gateway: TransportGateway,
    private readonly fcmAdapter: FcmAdapterService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue<NotificationDispatchJob>,
    @InjectQueue(QUEUE_NAMES.TRIP_REMINDERS)
    private readonly tripRemindersQueue: Queue<TripReminderJob>,
  ) {}

  async registerDeviceToken(
    organizationId: string,
    userId: string,
    dto: RegisterDeviceTokenDto,
  ) {
    const key = pushTokensRedisKey(organizationId, userId);
    const now = new Date().toISOString();
    await this.redis.client.hset(
      key,
      dto.token,
      JSON.stringify({ platform: dto.platform, updatedAt: now }),
    );
    await this.redis.client.expire(key, DEVICE_TOKEN_TTL_SECONDS);
    return {
      registered: true,
      platform: dto.platform,
      updatedAt: now,
    };
  }

  async listDeviceTokens(
    organizationId: string,
    userId: string,
  ): Promise<Array<{ token: string; platform: string; updatedAt: string }>> {
    const raw = await this.redis.client.hgetall(pushTokensRedisKey(organizationId, userId));
    return Object.entries(raw).map(([token, val]) => {
      try {
        const parsed = JSON.parse(val) as { platform?: string; updatedAt?: string };
        return {
          token,
          platform: parsed.platform ?? 'ANDROID',
          updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        };
      } catch {
        return { token, platform: 'ANDROID', updatedAt: new Date().toISOString() };
      }
    });
  }

  async listForUser(identity: RequestIdentity, query: PaginationQuery) {
    const offset = (query.page - 1) * query.limit;
    const baseFilter = and(
      eq(notifications.organizationId, identity.organizationId),
      eq(notifications.recipientUserId, identity.userId),
    );

    const [items, [countRow], [unreadRow]] = await Promise.all([
      this.dbService.db
        .select()
        .from(notifications)
        .where(baseFilter)
        .orderBy(desc(notifications.createdAt))
        .limit(query.limit)
        .offset(offset),
      this.dbService.db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(baseFilter),
      this.dbService.db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(baseFilter, isNull(notifications.readAt))),
    ]);

    return {
      items: items.map((row) => ({
        ...row,
        unreadCount: unreadRow?.count ?? 0,
      })),
      pagination: buildPaginationMeta(query.page, query.limit, countRow?.count ?? 0),
    };
  }

  async markRead(identity: RequestIdentity, notificationId: string) {
    const [existing] = await this.dbService.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.organizationId, identity.organizationId),
          eq(notifications.recipientUserId, identity.userId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Notification ${notificationId} not found.`,
      });
    }

    if (existing.readAt) return existing;

    const [updated] = await this.dbService.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId))
      .returning();

    return updated;
  }

  async markAllRead(identity: RequestIdentity) {
    const now = new Date();
    const updated = await this.dbService.db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.organizationId, identity.organizationId),
          eq(notifications.recipientUserId, identity.userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });

    return {
      markedCount: updated.length,
      markedAt: now.toISOString(),
    };
  }

  async enqueueNotification(job: NotificationDispatchJob): Promise<void> {
    const safeJobId = job.dedupKey ? `notif-${job.dedupKey.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined;
    await this.notificationsQueue.add('deliver-notification', job, safeJobId ? { jobId: safeJobId } : undefined);
  }

  async dispatchNotificationJob(job: NotificationDispatchJob) {
    if (job.dedupKey) {
      const claim = await this.redis.client.set(
        dedupRedisKey(job.dedupKey),
        '1',
        'EX',
        DEDUP_TTL_SECONDS,
        'NX',
      );
      if (claim !== 'OK') {
        return { skippedDuplicate: true, dedupKey: job.dedupKey };
      }
    }

    let createdRow: typeof notifications.$inferSelect | null = null;
    if (job.persistDb !== false) {
      const [inserted] = await this.dbService.db
        .insert(notifications)
        .values({
          organizationId: job.organizationId,
          recipientUserId: job.recipientUserId,
          channel: job.channel ?? 'IN_APP',
          category: job.category,
          title: job.title,
          body: job.body,
          metadataJson: job.metadataJson ?? null,
        })
        .returning();
      createdRow = inserted;
    }

    const tokens = await this.listDeviceTokens(job.organizationId, job.recipientUserId);
    const pushReceipt = await this.fcmAdapter.sendToTokens(tokens, {
      title: job.title,
      body: job.body,
      category: job.category,
      data: job.metadataJson,
    });

    const wsPayload = {
      id: createdRow?.id ?? null,
      category: job.category,
      title: job.title,
      body: job.body,
      recipientUserId: job.recipientUserId,
      tripId: job.tripId ?? null,
      metadata: job.metadataJson ?? null,
      createdAt: (createdRow?.createdAt ?? new Date()).toISOString(),
    };

    if (job.employeeId) {
      this.gateway.emitToRoom(WS_ROOMS.employee(job.employeeId), 'notification.created', wsPayload);
    }
    if (job.driverId) {
      this.gateway.emitToRoom(WS_ROOMS.driver(job.driverId), 'notification.created', wsPayload);
    }
    if (job.tripId) {
      this.gateway.emitToRoom(WS_ROOMS.trip(job.tripId), 'notification.created', wsPayload);
    }
    if (job.emitOpsRoom) {
      this.gateway.emitToRoom(
        WS_ROOMS.orgOps(job.organizationId),
        'notification.created',
        wsPayload,
      );
    }

    return {
      skippedDuplicate: false,
      notificationId: createdRow?.id ?? null,
      push: pushReceipt,
    };
  }

  async schedulePrePickupReminder(input: {
    organizationId: string;
    tripId: string;
    stopId: string;
    passengerAssignmentId: string;
    recipientUserId: string;
    employeeId: string;
    tripCode: string;
    stopLocationName: string;
    scheduledArrivalAt: Date;
  }): Promise<boolean> {
    const fireAtMs = input.scheduledArrivalAt.getTime() - PRE_PICKUP_REMINDER_LEAD_MS;
    const delayMs = fireAtMs - Date.now();
    if (delayMs <= 0 || delayMs > 48 * 60 * 60 * 1000) {
      return false;
    }

    const jobData: TripReminderJob = {
      kind: 'PRE_PICKUP_15M',
      organizationId: input.organizationId,
      tripId: input.tripId,
      stopId: input.stopId,
      passengerAssignmentId: input.passengerAssignmentId,
      recipientUserId: input.recipientUserId,
      employeeId: input.employeeId,
      tripCode: input.tripCode,
      stopLocationName: input.stopLocationName,
    };

    await this.tripRemindersQueue.add('pre-pickup-15m', jobData, {
      jobId: `rem-pre-${input.stopId}-${input.passengerAssignmentId}`,
      delay: delayMs,
    });
    return true;
  }

  async triggerCabApproachingReminder(input: {
    organizationId: string;
    tripId: string;
    stopId: string;
    tripCode: string;
    stopLocationName: string;
    distanceM: number;
    etaMinutes: number | null;
  }): Promise<number> {
    const pendingRows = await this.dbService.db
      .select({
        assignmentId: passengerAssignments.id,
        employeeId: passengerAssignments.employeeId,
        userId: employees.userId,
      })
      .from(passengerAssignments)
      .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
      .where(
        and(
          eq(passengerAssignments.organizationId, input.organizationId),
          eq(passengerAssignments.tripStopId, input.stopId),
          inArray(passengerAssignments.status, ['SCHEDULED', 'EN_ROUTE']),
        ),
      );

    for (const row of pendingRows) {
      const jobData: TripReminderJob = {
        kind: 'CAB_APPROACHING',
        organizationId: input.organizationId,
        tripId: input.tripId,
        stopId: input.stopId,
        passengerAssignmentId: row.assignmentId,
        recipientUserId: row.userId,
        employeeId: row.employeeId,
        tripCode: input.tripCode,
        stopLocationName: input.stopLocationName,
        distanceM: input.distanceM,
        etaMinutes: input.etaMinutes,
      };
      await this.tripRemindersQueue.add('cab-approaching', jobData, {
        jobId: `rem-near-${input.stopId}-${row.assignmentId}`,
      });
    }

    return pendingRows.length;
  }

  async processTripReminderJob(job: TripReminderJob) {
    const [trip] = await this.dbService.db
      .select()
      .from(trips)
      .where(and(eq(trips.id, job.tripId), eq(trips.organizationId, job.organizationId)))
      .limit(1);

    if (!trip || !['ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS'].includes(trip.status)) {
      return { skipped: true, reason: 'TRIP_INACTIVE' };
    }

    const [stop] = await this.dbService.db
      .select()
      .from(tripStops)
      .where(eq(tripStops.id, job.stopId))
      .limit(1);
    if (!stop || ['COMPLETED', 'SKIPPED'].includes(stop.status)) {
      return { skipped: true, reason: 'STOP_RESOLVED' };
    }

    if (job.passengerAssignmentId) {
      const [pa] = await this.dbService.db
        .select()
        .from(passengerAssignments)
        .where(eq(passengerAssignments.id, job.passengerAssignmentId))
        .limit(1);
      if (!pa || !['SCHEDULED', 'EN_ROUTE'].includes(pa.status)) {
        return { skipped: true, reason: 'PASSENGER_RESOLVED' };
      }
    }

    const isApproaching = job.kind === 'CAB_APPROACHING';
    const etaPart = job.etaMinutes != null ? ` (~${job.etaMinutes} min away)` : '';
    const title = isApproaching
      ? `Cab Approaching · ${job.tripCode}`
      : `Pickup in 15m · ${job.tripCode}`;
    const body = isApproaching
      ? `Your cab is ${job.distanceM ?? 500}m from ${job.stopLocationName}${etaPart}. Please head to your pickup pin.`
      : `Scheduled pickup at ${job.stopLocationName} in ~15 minutes. Keep your boarding OTP ready.`;

    const dedupKey = `${job.kind}-${job.stopId}-${job.passengerAssignmentId ?? job.recipientUserId}`;
    const res = await this.dispatchNotificationJob({
      organizationId: job.organizationId,
      recipientUserId: job.recipientUserId,
      employeeId: job.employeeId ?? null,
      tripId: job.tripId,
      channel: 'PUSH',
      category: job.kind,
      title,
      body,
      metadataJson: {
        tripId: job.tripId,
        stopId: job.stopId,
        distanceM: job.distanceM ?? null,
        etaMinutes: job.etaMinutes ?? null,
      },
      dedupKey,
      persistDb: true,
    });

    return { skipped: false, ...res };
  }
}

