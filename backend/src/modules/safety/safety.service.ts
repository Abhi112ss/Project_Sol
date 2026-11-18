import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  drivers,
  employees,
  gpsLocations,
  passengerAssignments,
  safetyAlerts,
  tripEvents,
  trips,
  tripStops,
  users,
  vehicles,
} from '../../infrastructure/database/schema/index.js';
import { OutboxService } from '../../infrastructure/event-management/outbox.service.js';
import { TRANSPORT_TOPICS } from '../../infrastructure/event-management/topics.js';
import { TransportGateway, WS_ROOMS } from '../../infrastructure/websocket/transport.gateway.js';
import { AuditLogsService } from '../audit-logs/audit-logs.module.js';
import { DriversService } from '../drivers/drivers.module.js';
import { EmployeesService } from '../employees/employees.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { evaluateLongStoppage, evaluateRouteDeviation } from './safety.detectors.js';
import type {
  AcknowledgeAlertDto,
  ListSafetyAlertsQuery,
  ResolveAlertDto,
  TriggerSosDto,
} from './safety.schemas.js';

const ANOMALY_COOLDOWN_MS = 10 * 60 * 1000;
const SAFE_REACH_OVERDUE_MINUTES = 15;

@Injectable()
export class SafetyService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly employeesService: EmployeesService,
    private readonly driversService: DriversService,
    private readonly auditLogs: AuditLogsService,
    private readonly outbox: OutboxService,
    private readonly gateway: TransportGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async triggerEmployeeSos(identity: RequestIdentity, dto: TriggerSosDto) {
    const emp = await this.employeesService.resolveEmployeeByUserId(
      identity.organizationId,
      identity.userId,
    );

    const created = await this._createSafetyAlert({
      organizationId: identity.organizationId,
      actorUserId: identity.userId,
      actorRole: identity.role,
      tripId: dto.tripId ?? null,
      employeeId: emp.id,
      driverId: null,
      alertType: 'SOS',
      severity: 'CRITICAL',
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      accuracyM: dto.accuracyM ?? null,
      notes: dto.notes ?? 'Emergency SOS triggered by employee from mobile app',
      wsEventName: 'safety.sos',
    });

    await this._notifyOrgOps(identity.organizationId, {
      category: 'SAFETY_SOS',
      title: 'CRITICAL SOS · Employee Alert',
      body: created.alert.notes ?? 'Emergency SOS triggered by employee.',
      tripId: created.alert.tripId,
      dedupKey: `sos-${created.alert.id}`,
      metadataJson: { alertId: created.alert.id, tripId: created.alert.tripId },
    });

    return created.alert;
  }

  async triggerDriverSos(identity: RequestIdentity, dto: TriggerSosDto) {
    const driver = await this.driversService.resolveDriverByUserId(
      identity.organizationId,
      identity.userId,
    );

    const created = await this._createSafetyAlert({
      organizationId: identity.organizationId,
      actorUserId: identity.userId,
      actorRole: identity.role,
      tripId: dto.tripId ?? null,
      employeeId: null,
      driverId: driver.id,
      alertType: 'SOS',
      severity: 'CRITICAL',
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      accuracyM: dto.accuracyM ?? null,
      notes: dto.notes ?? 'Emergency SOS triggered by cab driver on duty',
      wsEventName: 'safety.sos',
    });

    await this._notifyOrgOps(identity.organizationId, {
      category: 'SAFETY_SOS',
      title: 'CRITICAL SOS · Driver Alert',
      body: created.alert.notes ?? 'Emergency SOS triggered by driver.',
      tripId: created.alert.tripId,
      dedupKey: `sos-${created.alert.id}`,
      metadataJson: { alertId: created.alert.id, tripId: created.alert.tripId },
    });

    return created.alert;
  }

  async listAdminAlerts(organizationId: string, query: ListSafetyAlertsQuery) {
    const conditions = [eq(safetyAlerts.organizationId, organizationId)];
    if (query.status) conditions.push(eq(safetyAlerts.status, query.status));
    if (query.alertType) conditions.push(eq(safetyAlerts.alertType, query.alertType));
    if (query.severity) conditions.push(eq(safetyAlerts.severity, query.severity));

    const rows = await this.dbService.db
      .select({
        alert: safetyAlerts,
        tripCode: trips.tripCode,
        vehicleRegistrationNo: vehicles.registrationNo,
        employeeCode: employees.employeeCode,
        driverCode: drivers.driverCode,
        employeeUserId: employees.userId,
        driverUserId: drivers.userId,
      })
      .from(safetyAlerts)
      .leftJoin(trips, eq(safetyAlerts.tripId, trips.id))
      .leftJoin(vehicles, eq(trips.vehicleId, vehicles.id))
      .leftJoin(employees, eq(safetyAlerts.employeeId, employees.id))
      .leftJoin(drivers, eq(safetyAlerts.driverId, drivers.id))
      .where(and(...conditions))
      .orderBy(desc(safetyAlerts.createdAt))
      .limit(100);

    const userIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.employeeUserId, r.driverUserId, r.alert.acknowledgedBy, r.alert.resolvedBy])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const userMap = new Map<string, { fullName: string; phone: string }>();
    if (userIds.length > 0) {
      const userRows = await this.dbService.db
        .select({ id: users.id, fullName: users.fullName, phone: users.phone })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of userRows) {
        userMap.set(u.id, { fullName: u.fullName, phone: u.phone });
      }
    }

    return rows.map((r) => ({
      ...r.alert,
      tripCode: r.tripCode ?? null,
      vehicleRegistrationNo: r.vehicleRegistrationNo ?? null,
      employeeCode: r.employeeCode ?? null,
      employeeName: r.employeeUserId ? (userMap.get(r.employeeUserId)?.fullName ?? null) : null,
      employeePhone: r.employeeUserId ? (userMap.get(r.employeeUserId)?.phone ?? null) : null,
      driverCode: r.driverCode ?? null,
      driverName: r.driverUserId ? (userMap.get(r.driverUserId)?.fullName ?? null) : null,
      driverPhone: r.driverUserId ? (userMap.get(r.driverUserId)?.phone ?? null) : null,
      acknowledgedByName: r.alert.acknowledgedBy
        ? (userMap.get(r.alert.acknowledgedBy)?.fullName ?? null)
        : null,
      resolvedByName: r.alert.resolvedBy
        ? (userMap.get(r.alert.resolvedBy)?.fullName ?? null)
        : null,
    }));
  }

  async acknowledgeAlert(identity: RequestIdentity, alertId: string, dto: AcknowledgeAlertDto) {
    const updated = await this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(safetyAlerts)
        .where(and(eq(safetyAlerts.id, alertId), eq(safetyAlerts.organizationId, identity.organizationId)))
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Safety alert ${alertId} not found.`,
        });
      }

      if (existing.status === 'RESOLVED') {
        throw new ConflictException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Resolved safety alert cannot transition back to ACKNOWLEDGED.',
        });
      }

      const now = new Date();
      const [saved] = await tx
        .update(safetyAlerts)
        .set({
          status: 'ACKNOWLEDGED',
          acknowledgedBy: existing.acknowledgedBy ?? identity.userId,
          acknowledgedAt: existing.acknowledgedAt ?? now,
          resolutionNotes: dto.notes?.trim() || existing.resolutionNotes,
          updatedAt: now,
        })
        .where(eq(safetyAlerts.id, alertId))
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'SAFETY_ALERT_ACKNOWLEDGED',
        entityType: 'safety_alert',
        entityId: alertId,
        reason: dto.notes ?? null,
        beforeJson: { status: existing.status },
        afterJson: { status: 'ACKNOWLEDGED' },
      });

      return saved;
    });

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'safety.alert.updated', updated);
    if (updated.tripId) {
      this.gateway.emitToRoom(WS_ROOMS.trip(updated.tripId), 'safety.alert.updated', updated);
    }
    return updated;
  }

  async resolveAlert(identity: RequestIdentity, alertId: string, dto: ResolveAlertDto) {
    const res = await this.dbService.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(safetyAlerts)
        .where(and(eq(safetyAlerts.id, alertId), eq(safetyAlerts.organizationId, identity.organizationId)))
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Safety alert ${alertId} not found.`,
        });
      }

      if (existing.status === 'RESOLVED') {
        throw new BadRequestException({
          code: 'INVALID_STATE_TRANSITION',
          message: 'Safety alert is already RESOLVED.',
        });
      }

      const now = new Date();
      const [saved] = await tx
        .update(safetyAlerts)
        .set({
          status: 'RESOLVED',
          acknowledgedBy: existing.acknowledgedBy ?? identity.userId,
          acknowledgedAt: existing.acknowledgedAt ?? now,
          resolvedBy: identity.userId,
          resolvedAt: now,
          resolutionNotes: dto.resolutionNotes.trim(),
          updatedAt: now,
        })
        .where(eq(safetyAlerts.id, alertId))
        .returning();

      if (existing.tripId) {
        await tx.insert(tripEvents).values({
          organizationId: identity.organizationId,
          tripId: existing.tripId,
          actorUserId: identity.userId,
          actorRole: identity.role,
          eventType: 'SAFETY_ALERT_RESOLVED',
          clientEventId: crypto.randomUUID(),
          occurredAtClient: now,
          payloadJson: { alertId, alertType: existing.alertType, resolutionNotes: dto.resolutionNotes },
        });
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'SAFETY_ALERT_RESOLVED',
        entityType: 'safety_alert',
        entityId: alertId,
        reason: dto.resolutionNotes.trim(),
        beforeJson: { status: existing.status },
        afterJson: { status: 'RESOLVED' },
      });

      let employeeUserId: string | null = null;
      if (existing.employeeId) {
        const [empRow] = await tx
          .select({ userId: employees.userId })
          .from(employees)
          .where(eq(employees.id, existing.employeeId))
          .limit(1);
        employeeUserId = empRow?.userId ?? null;
      }

      return { saved, employeeUserId };
    });

    if (res.employeeUserId) {
      await this.notifications.enqueueNotification({
        organizationId: identity.organizationId,
        recipientUserId: res.employeeUserId,
        employeeId: res.saved.employeeId,
        tripId: res.saved.tripId,
        channel: 'PUSH',
        category: 'SAFETY_ALERT_RESOLVED',
        title: `Safety Alert Resolved (${res.saved.alertType})`,
        body: res.saved.resolutionNotes ?? 'Operations marked your safety alert resolved.',
        metadataJson: { alertId: res.saved.id, tripId: res.saved.tripId },
        dedupKey: `alert-resolved-${res.saved.id}`,
      });
    }

    this.gateway.emitToRoom(WS_ROOMS.orgOps(identity.organizationId), 'safety.alert.updated', res.saved);
    if (res.saved.tripId) {
      this.gateway.emitToRoom(WS_ROOMS.trip(res.saved.tripId), 'safety.alert.updated', res.saved);
    }

    return res.saved;
  }

  async evaluateTelemetryAnomalies(input: {
    organizationId: string;
    tripId: string;
    driverId: string;
    latitude: number;
    longitude: number;
    speedMps: number | null;
    recordedAt: string;
  }) {
    const [stops, recentGps, recentAlerts] = await Promise.all([
      this.dbService.db
        .select()
        .from(tripStops)
        .where(and(eq(tripStops.tripId, input.tripId), eq(tripStops.organizationId, input.organizationId)))
        .orderBy(asc(tripStops.sequenceNo)),
      this.dbService.db
        .select()
        .from(gpsLocations)
        .where(and(eq(gpsLocations.tripId, input.tripId), eq(gpsLocations.organizationId, input.organizationId)))
        .orderBy(desc(gpsLocations.recordedAt))
        .limit(20),
      this.dbService.db
        .select()
        .from(safetyAlerts)
        .where(
          and(
            eq(safetyAlerts.tripId, input.tripId),
            eq(safetyAlerts.organizationId, input.organizationId),
            gte(safetyAlerts.createdAt, new Date(Date.now() - ANOMALY_COOLDOWN_MS)),
          ),
        ),
    ]);

    const triggered: string[] = [];

    const deviation = evaluateRouteDeviation({
      latitude: input.latitude,
      longitude: input.longitude,
      speedMps: input.speedMps,
      routeStops: stops,
    });
    const hasRecentDeviation = recentAlerts.some(
      (a) => a.alertType === 'ROUTE_DEVIATION' && a.status !== 'RESOLVED',
    );
    if (deviation.isDeviated && !hasRecentDeviation) {
      const created = await this._createSafetyAlert({
        organizationId: input.organizationId,
        actorUserId: null,
        actorRole: 'SYSTEM',
        tripId: input.tripId,
        employeeId: null,
        driverId: input.driverId,
        alertType: 'ROUTE_DEVIATION',
        severity: 'HIGH',
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyM: null,
        notes: `Automated route deviation detected (${deviation.minDistanceMeters}m off assigned corridor).`,
        wsEventName: 'safety.alert.created',
      });
      await this._notifyOrgOps(input.organizationId, {
        category: 'ROUTE_DEVIATION',
        title: 'Route Deviation Detected',
        body: created.alert.notes ?? 'Vehicle off assigned route corridor.',
        tripId: input.tripId,
        dedupKey: `dev-${created.alert.id}`,
        metadataJson: { alertId: created.alert.id, tripId: input.tripId },
      });
      triggered.push('ROUTE_DEVIATION');
    }

    const stoppage = evaluateLongStoppage({
      latitude: input.latitude,
      longitude: input.longitude,
      routeStops: stops,
      recentSamples: recentGps.map((g) => ({
        latitude: g.latitude,
        longitude: g.longitude,
        speedMps: g.speedMps,
        recordedAt: g.recordedAt,
      })),
    });
    const hasRecentStoppage = recentAlerts.some(
      (a) => a.alertType === 'LONG_STOPPAGE' && a.status !== 'RESOLVED',
    );
    if (stoppage.isStopped && !hasRecentStoppage) {
      const created = await this._createSafetyAlert({
        organizationId: input.organizationId,
        actorUserId: null,
        actorRole: 'SYSTEM',
        tripId: input.tripId,
        employeeId: null,
        driverId: input.driverId,
        alertType: 'LONG_STOPPAGE',
        severity: 'MEDIUM',
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyM: null,
        notes: `Unscheduled mid-route stoppage detected (${Math.round(stoppage.durationSeconds / 60)}m stationary outside pickup geofence).`,
        wsEventName: 'safety.alert.created',
      });
      await this._notifyOrgOps(input.organizationId, {
        category: 'LONG_STOPPAGE',
        title: 'Unscheduled Vehicle Stoppage',
        body: created.alert.notes ?? 'Vehicle stationary outside planned stop.',
        tripId: input.tripId,
        dedupKey: `stop-${created.alert.id}`,
        metadataJson: { alertId: created.alert.id, tripId: input.tripId },
      });
      triggered.push('LONG_STOPPAGE');
    }

    return { triggered };
  }

  async scanOverdueSafeReach(organizationId?: string, graceMinutes = SAFE_REACH_OVERDUE_MINUTES) {
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);
    const conditions = [
      eq(trips.status, 'COMPLETED'),
      lte(trips.completedAt, cutoff),
      inArray(passengerAssignments.status, ['BOARDED', 'DROPPED']),
      isNull(passengerAssignments.safeReachConfirmedAt),
    ];
    if (organizationId) {
      conditions.push(eq(trips.organizationId, organizationId));
    }

    const overdueRows = await this.dbService.db
      .select({
        trip: trips,
        assignment: passengerAssignments,
        employeeUserId: employees.userId,
        employeeCode: employees.employeeCode,
      })
      .from(passengerAssignments)
      .innerJoin(trips, eq(passengerAssignments.tripId, trips.id))
      .innerJoin(employees, eq(passengerAssignments.employeeId, employees.id))
      .where(and(...conditions))
      .limit(100);

    let createdCount = 0;
    for (const row of overdueRows) {
      const [existing] = await this.dbService.db
        .select({ id: safetyAlerts.id })
        .from(safetyAlerts)
        .where(
          and(
            eq(safetyAlerts.organizationId, row.trip.organizationId),
            eq(safetyAlerts.tripId, row.trip.id),
            eq(safetyAlerts.employeeId, row.assignment.employeeId),
            eq(safetyAlerts.alertType, 'SAFE_REACH_OVERDUE'),
          ),
        )
        .limit(1);

      if (existing) continue;

      const created = await this._createSafetyAlert({
        organizationId: row.trip.organizationId,
        actorUserId: null,
        actorRole: 'SYSTEM',
        tripId: row.trip.id,
        employeeId: row.assignment.employeeId,
        driverId: row.trip.driverId,
        alertType: 'SAFE_REACH_OVERDUE',
        severity: 'HIGH',
        latitude: null,
        longitude: null,
        accuracyM: null,
        notes: `Safe Reach confirmation overdue (> ${graceMinutes}m after ${row.trip.tripCode} completed) for ${row.employeeCode}.`,
        wsEventName: 'safety.alert.created',
      });

      await this.notifications.enqueueNotification({
        organizationId: row.trip.organizationId,
        recipientUserId: row.employeeUserId,
        employeeId: row.assignment.employeeId,
        tripId: row.trip.id,
        channel: 'PUSH',
        category: 'SAFE_REACH_OVERDUE',
        title: `Confirm Safe Reach · ${row.trip.tripCode}`,
        body: 'Your trip completed recently. Please confirm Safe Reach in the app or operations will check in.',
        metadataJson: { tripId: row.trip.id, alertId: created.alert.id },
        dedupKey: `safe-reach-emp-${row.trip.id}-${row.assignment.employeeId}`,
      });

      await this._notifyOrgOps(row.trip.organizationId, {
        category: 'SAFE_REACH_OVERDUE',
        title: `Safe Reach Overdue · ${row.employeeCode}`,
        body: created.alert.notes ?? 'Safe reach confirmation missing.',
        tripId: row.trip.id,
        dedupKey: `safe-reach-ops-${created.alert.id}`,
        metadataJson: { alertId: created.alert.id, tripId: row.trip.id },
      });

      createdCount += 1;
    }

    return { scannedCount: overdueRows.length, createdCount };
  }

  private async _createSafetyAlert(input: {
    organizationId: string;
    actorUserId: string | null;
    actorRole: string;
    tripId: string | null;
    employeeId: string | null;
    driverId: string | null;
    alertType: 'SOS' | 'ROUTE_DEVIATION' | 'LONG_STOPPAGE' | 'SAFE_REACH_OVERDUE';
    severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
    latitude: number | null;
    longitude: number | null;
    accuracyM: number | null;
    notes: string;
    wsEventName: 'safety.sos' | 'safety.alert.created';
  }) {
    const result = await this.dbService.transaction(async (tx) => {
      let tripRow: typeof trips.$inferSelect | null = null;
      if (input.tripId) {
        const [found] = await tx
          .select()
          .from(trips)
          .where(and(eq(trips.id, input.tripId), eq(trips.organizationId, input.organizationId)))
          .limit(1);
        if (!found) {
          throw new NotFoundException({
            code: 'RESOURCE_NOT_FOUND',
            message: `Trip ${input.tripId} not found.`,
          });
        }
        tripRow = found;
      }

      const [alert] = await tx
        .insert(safetyAlerts)
        .values({
          organizationId: input.organizationId,
          tripId: tripRow?.id ?? null,
          employeeId: input.employeeId,
          driverId: input.driverId ?? tripRow?.driverId ?? null,
          alertType: input.alertType,
          severity: input.severity,
          status: 'OPEN',
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyM: input.accuracyM,
          notes: input.notes,
        })
        .returning();

      if (tripRow) {
        await tx.insert(tripEvents).values({
          organizationId: input.organizationId,
          tripId: tripRow.id,
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          eventType:
            input.alertType === 'SOS' ? 'SAFETY_SOS_TRIGGERED' : `SAFETY_${input.alertType}`,
          clientEventId: crypto.randomUUID(),
          occurredAtClient: new Date(),
          latitude: input.latitude,
          longitude: input.longitude,
          gpsAccuracyM: input.accuracyM,
          payloadJson: {
            alertId: alert.id,
            alertType: input.alertType,
            employeeId: input.employeeId,
            driverId: alert.driverId,
          },
        });
      }

      await this.auditLogs.recordInTx(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action:
          input.alertType === 'SOS' ? 'SAFETY_SOS_TRIGGERED' : `SAFETY_${input.alertType}`,
        entityType: 'safety_alert',
        entityId: alert.id,
        reason: input.notes,
        afterJson: {
          tripId: tripRow?.id ?? null,
          alertType: input.alertType,
          severity: input.severity,
          latitude: input.latitude,
          longitude: input.longitude,
        },
      });

      await this.outbox.enqueueInTx(tx, {
        organizationId: input.organizationId,
        topic: TRANSPORT_TOPICS.SAFETY_EVENTS,
        aggregateType: 'safety_alert',
        aggregateId: alert.id,
        payload: {
          event: input.wsEventName,
          alertId: alert.id,
          alertType: input.alertType,
          tripId: tripRow?.id ?? null,
          employeeId: input.employeeId,
          severity: input.severity,
        },
      });

      return { alert, driverId: alert.driverId };
    });

    const eventPayload = {
      alertId: result.alert.id,
      tripId: result.alert.tripId,
      employeeId: result.alert.employeeId,
      driverId: result.alert.driverId,
      alertType: result.alert.alertType,
      severity: result.alert.severity,
      status: result.alert.status,
      latitude: result.alert.latitude,
      longitude: result.alert.longitude,
      notes: result.alert.notes,
      serverTime: new Date().toISOString(),
    };
    this.gateway.emitToRoom(WS_ROOMS.orgOps(input.organizationId), input.wsEventName, eventPayload);
    if (result.alert.tripId) {
      this.gateway.emitToRoom(WS_ROOMS.trip(result.alert.tripId), input.wsEventName, eventPayload);
    }
    if (result.driverId) {
      this.gateway.emitToRoom(WS_ROOMS.driver(result.driverId), input.wsEventName, eventPayload);
    }

    return result;
  }

  private async _notifyOrgOps(
    organizationId: string,
    payload: {
      category: string;
      title: string;
      body: string;
      tripId: string | null;
      dedupKey: string;
      metadataJson?: Record<string, unknown>;
    },
  ) {
    // Emit liveSocket notification event to orgOps and enqueue to first active admin user for inbox visibility
    const adminRows = await this.dbService.db.execute<{ user_id: string }>(sql`
      SELECT DISTINCT user_id
      FROM memberships
      WHERE organization_id = ${organizationId}
        AND role IN ('ORG_ADMIN', 'TRANSPORT_MANAGER')
        AND is_active = true
      LIMIT 3
    `);

    for (const row of adminRows.rows) {
      await this.notifications.enqueueNotification({
        organizationId,
        recipientUserId: row.user_id,
        tripId: payload.tripId,
        channel: 'IN_APP',
        category: payload.category,
        title: payload.title,
        body: payload.body,
        metadataJson: payload.metadataJson,
        dedupKey: `${payload.dedupKey}-${row.user_id}`,
        emitOpsRoom: true,
      });
    }
  }
}

