import { describe, expect, it, vi } from 'vitest';
import { FcmAdapterService, NotificationsService } from './notifications.service.js';

describe('Phase 6 NotificationsService & FcmAdapterService', () => {
  it('delivers safely via LOCAL_DEV_SINK fallback and prevents duplicate notification jobs by dedupKey', async () => {
    const fcmAdapter = new FcmAdapterService();
    const seenKeys = new Set<string>();
    const insertedRows: Array<Record<string, unknown>> = [];

    const mockRedis = {
      client: {
        set: vi.fn(async (key: string, _val: string, _ex: string, _ttl: number, _nx: string) => {
          if (seenKeys.has(key)) return null;
          seenKeys.add(key);
          return 'OK';
        }),
        hgetall: vi.fn(async () => ({
          'sample-fcm-token-123456': JSON.stringify({
            platform: 'ANDROID',
            updatedAt: new Date().toISOString(),
          }),
        })),
      },
    };

    const mockDbService = {
      db: {
        insert: vi.fn(() => ({
          values: vi.fn((vals: Record<string, unknown>) => {
            insertedRows.push(vals);
            return {
              returning: vi.fn(async () => [{ id: 'notif-1', createdAt: new Date(), ...vals }]),
            };
          }),
        })),
      },
    };

    const emitted: Array<{ room: string; event: string }> = [];
    const mockGateway = {
      emitToRoom: vi.fn((room: string, event: string) => {
        emitted.push({ room, event });
      }),
    };

    const mockNotifQueue = { add: vi.fn(async () => undefined) };
    const mockReminderQueue = { add: vi.fn(async () => undefined) };

    const service = new NotificationsService(
      mockDbService as never,
      mockRedis as never,
      mockGateway as never,
      fcmAdapter,
      mockNotifQueue as never,
      mockReminderQueue as never,
    );

    const first = await service.dispatchNotificationJob({
      organizationId: 'org-1',
      recipientUserId: 'user-1',
      employeeId: 'emp-1',
      tripId: 'trip-1',
      channel: 'PUSH',
      category: 'CAB_APPROACHING',
      title: 'Cab nearby',
      body: 'Arriving in 2 min',
      dedupKey: 'near-stop-1',
    });

    const duplicate = await service.dispatchNotificationJob({
      organizationId: 'org-1',
      recipientUserId: 'user-1',
      employeeId: 'emp-1',
      tripId: 'trip-1',
      channel: 'PUSH',
      category: 'CAB_APPROACHING',
      title: 'Cab nearby',
      body: 'Arriving in 2 min',
      dedupKey: 'near-stop-1',
    });

    expect(first.skippedDuplicate).toBe(false);
    expect(first.push?.attemptedTokens).toBe(1);
    expect(first.push?.mode).toBe('LOCAL_DEV_SINK');
    expect(duplicate.skippedDuplicate).toBe(true);
    expect(insertedRows).toHaveLength(1);
    expect(emitted.some((e) => e.event === 'notification.created')).toBe(true);
  });

  it('schedules delayed 15-minute pre-pickup reminder jobs idempotently', async () => {
    const addedJobs: Array<{ name: string; opts: { delay?: number; jobId?: string } }> = [];
    const service = new NotificationsService(
      {} as never,
      {} as never,
      {} as never,
      new FcmAdapterService(),
      { add: vi.fn() } as never,
      {
        add: vi.fn(async (name: string, _data: unknown, opts: { delay?: number; jobId?: string }) => {
          addedJobs.push({ name, opts });
        }),
      } as never,
    );

    const futureArrival = new Date(Date.now() + 45 * 60 * 1000);
    const scheduled = await service.schedulePrePickupReminder({
      organizationId: 'org-1',
      tripId: 'trip-1',
      stopId: 'stop-1',
      passengerAssignmentId: 'pa-1',
      recipientUserId: 'user-1',
      employeeId: 'emp-1',
      tripCode: 'TRP-2026-01',
      stopLocationName: 'Kukatpally',
      scheduledArrivalAt: futureArrival,
    });

    expect(scheduled).toBe(true);
    expect(addedJobs).toHaveLength(1);
    expect(addedJobs[0].name).toBe('pre-pickup-15m');
    expect(addedJobs[0].opts.jobId).toBe('rem-pre-stop-1-pa-1');
    expect(addedJobs[0].opts.delay).toBeGreaterThan(20 * 60 * 1000);
  });
});

