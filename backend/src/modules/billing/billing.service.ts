import crypto from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  auditLogs,
  drivers,
  gpsLocations,
  invoices,
  passengerAssignments,
  shifts,
  trips,
  tripStops,
  users,
  vehicles,
  vendors,
} from '../../infrastructure/database/schema/index.js';
import { AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  calculateInvoiceTotals,
  calculateTripLineBilling,
  computeTripDistanceKm,
  formatInvoiceStatementCsv,
  type TripLineBilling,
} from './billing.calculator.js';
import {
  type BillingSummaryQuery,
  type GenerateInvoiceDto,
  INVOICE_TRANSITIONS,
  type InvoiceStatus,
  type ListInvoicesQuery,
  type PreviewInvoiceQuery,
  type UpdateInvoiceStatusDto,
} from './billing.schemas.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private assertDateOrder(periodStart: string, periodEnd: string) {
    if (periodStart > periodEnd) {
      throw new UnprocessableEntityException({
        code: 'INVALID_PERIOD_RANGE',
        message: 'periodStart must be on or before periodEnd.',
      });
    }
  }

  private async resolveVendor(organizationId: string, vendorId: string) {
    const [vendor] = await this.dbService.db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
      .limit(1);

    if (!vendor) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Vendor ${vendorId} not found in active organization.`,
      });
    }
    return vendor;
  }

  private async computeVendorPeriodPreview(
    organizationId: string,
    vendorId: string,
    periodStart: string,
    periodEnd: string,
    gstBps: number,
  ) {
    this.assertDateOrder(periodStart, periodEnd);
    const vendor = await this.resolveVendor(organizationId, vendorId);

    const periodTrips = await this.dbService.db
      .select({
        trip: trips,
        shiftName: shifts.name,
        vehicleRegistrationNo: vehicles.registrationNo,
        vehicleVendorId: vehicles.vendorId,
        driverName: users.fullName,
      })
      .from(trips)
      .innerJoin(shifts, eq(shifts.id, trips.shiftId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .leftJoin(drivers, eq(drivers.id, trips.driverId))
      .leftJoin(users, eq(users.id, drivers.userId))
      .where(
        and(
          eq(trips.organizationId, organizationId),
          gte(trips.travelDate, periodStart),
          lte(trips.travelDate, periodEnd),
        ),
      )
      .orderBy(asc(trips.travelDate), asc(trips.plannedStartAt));

    const vendorTrips = periodTrips.filter(
      (row) => (row.trip.vendorId ?? row.vehicleVendorId) === vendorId,
    );

    const completedRows = vendorTrips.filter((r) => r.trip.status === 'COMPLETED');
    const cancelledOrAbortedCount = vendorTrips.filter(
      (r) => r.trip.status === 'CANCELLED' || r.trip.status === 'ABORTED',
    ).length;
    const inFlightCount = vendorTrips.filter(
      (r) =>
        r.trip.status === 'CREATED' ||
        r.trip.status === 'ASSIGNED' ||
        r.trip.status === 'DRIVER_ACCEPTED' ||
        r.trip.status === 'IN_PROGRESS',
    ).length;

    const completedTripIds = completedRows.map((r) => r.trip.id);

    const [stopsRows, gpsRows, assignmentRows, overlappingInvoices] = await Promise.all([
      completedTripIds.length > 0
        ? this.dbService.db
            .select()
            .from(tripStops)
            .where(inArray(tripStops.tripId, completedTripIds))
            .orderBy(asc(tripStops.tripId), asc(tripStops.sequenceNo))
        : Promise.resolve([]),
      completedTripIds.length > 0
        ? this.dbService.db
            .select({
              tripId: gpsLocations.tripId,
              latitude: gpsLocations.latitude,
              longitude: gpsLocations.longitude,
              recordedAt: gpsLocations.recordedAt,
            })
            .from(gpsLocations)
            .where(inArray(gpsLocations.tripId, completedTripIds))
            .orderBy(asc(gpsLocations.tripId), asc(gpsLocations.recordedAt))
        : Promise.resolve([]),
      completedTripIds.length > 0
        ? this.dbService.db
            .select({
              tripId: passengerAssignments.tripId,
              status: passengerAssignments.status,
              arrivalDelaySeconds: passengerAssignments.arrivalDelaySeconds,
            })
            .from(passengerAssignments)
            .where(inArray(passengerAssignments.tripId, completedTripIds))
        : Promise.resolve([]),
      this.dbService.db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.vendorId, vendorId),
            lte(invoices.periodStart, periodEnd),
            gte(invoices.periodEnd, periodStart),
          ),
        )
        .orderBy(desc(invoices.createdAt)),
    ]);

    const stopsByTrip = new Map<string, Array<{ latitude: number; longitude: number }>>();
    for (const s of stopsRows) {
      const list = stopsByTrip.get(s.tripId) ?? [];
      list.push({ latitude: s.latitude, longitude: s.longitude });
      stopsByTrip.set(s.tripId, list);
    }

    const gpsByTrip = new Map<string, Array<{ latitude: number; longitude: number }>>();
    for (const g of gpsRows) {
      const list = gpsByTrip.get(g.tripId) ?? [];
      list.push({ latitude: g.latitude, longitude: g.longitude });
      gpsByTrip.set(g.tripId, list);
    }

    const assignStatsByTrip = new Map<
      string,
      { boardedCount: number; noShowCount: number; delayedStopsCount: number }
    >();
    for (const a of assignmentRows) {
      const stats = assignStatsByTrip.get(a.tripId) ?? {
        boardedCount: 0,
        noShowCount: 0,
        delayedStopsCount: 0,
      };
      if (a.status === 'BOARDED' || a.status === 'DROPPED') stats.boardedCount += 1;
      if (a.status === 'NO_SHOW') stats.noShowCount += 1;
      if ((a.arrivalDelaySeconds ?? 0) > 120) stats.delayedStopsCount += 1;
      assignStatsByTrip.set(a.tripId, stats);
    }

    const lineItems: TripLineBilling[] = completedRows.map((row) => {
      const tid = row.trip.id;
      const dist = computeTripDistanceKm(gpsByTrip.get(tid) ?? [], stopsByTrip.get(tid) ?? []);
      const stats = assignStatsByTrip.get(tid) ?? {
        boardedCount: 0,
        noShowCount: 0,
        delayedStopsCount: 0,
      };

      return calculateTripLineBilling({
        tripId: tid,
        tripCode: row.trip.tripCode,
        travelDate: row.trip.travelDate,
        direction: row.trip.direction,
        shiftName: row.shiftName,
        driverName: row.driverName,
        vehicleRegistrationNo: row.vehicleRegistrationNo,
        boardedCount: stats.boardedCount,
        noShowCount: stats.noShowCount,
        delayedStopsCount: stats.delayedStopsCount,
        distanceKm: dist.distanceKm,
        distanceSource: dist.distanceSource,
        baseTripPaise: vendor.billingBaseTripPaise,
        ratePerKmPaise: vendor.billingRatePerKmPaise,
      });
    });

    const totals = calculateInvoiceTotals(lineItems, gstBps);

    return {
      vendor,
      periodStart,
      periodEnd,
      totals,
      cancelledOrAbortedCount,
      inFlightCount,
      lineItems,
      overlappingInvoices,
    };
  }

  async getBillingSummary(organizationId: string, query: BillingSummaryQuery) {
    if (query.periodStart && query.periodEnd) {
      this.assertDateOrder(query.periodStart, query.periodEnd);
    }

    const invoiceConditions = [eq(invoices.organizationId, organizationId)];
    if (query.vendorId) invoiceConditions.push(eq(invoices.vendorId, query.vendorId));
    if (query.periodStart) invoiceConditions.push(gte(invoices.periodEnd, query.periodStart));
    if (query.periodEnd) invoiceConditions.push(lte(invoices.periodStart, query.periodEnd));

    const tripConditions = [
      eq(trips.organizationId, organizationId),
      eq(trips.status, 'COMPLETED'),
    ];
    if (query.vendorId) tripConditions.push(eq(trips.vendorId, query.vendorId));
    if (query.periodStart) tripConditions.push(gte(trips.travelDate, query.periodStart));
    if (query.periodEnd) tripConditions.push(lte(trips.travelDate, query.periodEnd));

    const [invoiceRows, vendorRows, completedTripRows] = await Promise.all([
      this.dbService.db
        .select()
        .from(invoices)
        .where(and(...invoiceConditions)),
      this.dbService.db
        .select()
        .from(vendors)
        .where(eq(vendors.organizationId, organizationId))
        .orderBy(asc(vendors.name)),
      this.dbService.db
        .select({
          id: trips.id,
          vendorId: trips.vendorId,
          travelDate: trips.travelDate,
        })
        .from(trips)
        .where(and(...tripConditions)),
    ]);

    const byStatus = {
      DRAFT: { count: 0, totalPaise: 0 },
      ISSUED: { count: 0, totalPaise: 0 },
      RECONCILED: { count: 0, totalPaise: 0 },
      DISPUTED: { count: 0, totalPaise: 0 },
    };

    for (const inv of invoiceRows) {
      const bucket = byStatus[inv.status];
      bucket.count += 1;
      bucket.totalPaise += inv.totalPaise;
    }

    // Count completed trips that do not fall inside any active (non-DRAFT/or any) invoice range for that vendor
    const unbilledTripsCount = completedTripRows.filter((trip) => {
      if (!trip.vendorId) return true;
      return !invoiceRows.some(
        (inv) =>
          inv.vendorId === trip.vendorId &&
          inv.periodStart <= trip.travelDate &&
          inv.periodEnd >= trip.travelDate,
      );
    }).length;

    const totalInvoicedPaise = invoiceRows.reduce((s, i) => s + i.totalPaise, 0);

    return {
      invoiceCount: invoiceRows.length,
      totalInvoicedPaise,
      byStatus,
      completedTripsInRange: completedTripRows.length,
      unbilledCompletedTrips: unbilledTripsCount,
      vendors: vendorRows,
    };
  }

  async listInvoices(organizationId: string, query: ListInvoicesQuery) {
    const conditions = [eq(invoices.organizationId, organizationId)];
    if (query.vendorId) conditions.push(eq(invoices.vendorId, query.vendorId));
    if (query.status) conditions.push(eq(invoices.status, query.status));
    if (query.periodStart) conditions.push(gte(invoices.periodStart, query.periodStart));
    if (query.periodEnd) conditions.push(lte(invoices.periodEnd, query.periodEnd));

    const rows = await this.dbService.db
      .select({
        invoice: invoices,
        vendorName: vendors.name,
        vendorCode: vendors.code,
        billingBaseTripPaise: vendors.billingBaseTripPaise,
        billingRatePerKmPaise: vendors.billingRatePerKmPaise,
      })
      .from(invoices)
      .innerJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt));

    return rows.map((r) => ({
      ...r.invoice,
      vendorName: r.vendorName,
      vendorCode: r.vendorCode,
      billingBaseTripPaise: r.billingBaseTripPaise,
      billingRatePerKmPaise: r.billingRatePerKmPaise,
    }));
  }

  async previewInvoice(organizationId: string, query: PreviewInvoiceQuery) {
    return this.computeVendorPeriodPreview(
      organizationId,
      query.vendorId,
      query.periodStart,
      query.periodEnd,
      query.gstBps,
    );
  }

  async generateInvoice(identity: RequestIdentity, dto: GenerateInvoiceDto) {
    const preview = await this.computeVendorPeriodPreview(
      identity.organizationId,
      dto.vendorId,
      dto.periodStart,
      dto.periodEnd,
      dto.gstBps,
    );

    if (preview.totals.totalTrips === 0) {
      throw new UnprocessableEntityException({
        code: 'NO_BILLABLE_TRIPS',
        message: `No COMPLETED trips found for vendor ${preview.vendor.code} between ${dto.periodStart} and ${dto.periodEnd}.`,
      });
    }

    const ym = dto.periodStart.slice(0, 7).replace('-', '');
    const vendorTag = preview.vendor.code
      .replaceAll(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase();
    const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    const invoiceNumber = `INV-${ym}-${vendorTag || 'VND'}-${suffix}`;

    const created = await this.dbService.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(invoices)
        .values({
          organizationId: identity.organizationId,
          vendorId: dto.vendorId,
          invoiceNumber,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          totalTrips: preview.totals.totalTrips,
          totalDistanceKm: preview.totals.totalDistanceKm,
          subtotalPaise: preview.totals.subtotalPaise,
          taxPaise: preview.totals.taxPaise,
          totalPaise: preview.totals.totalPaise,
          currency: 'INR',
          status: dto.initialStatus,
        })
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: inserted.id,
        reason: dto.note ?? null,
        afterJson: {
          invoiceNumber: inserted.invoiceNumber,
          vendorId: dto.vendorId,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          totalTrips: preview.totals.totalTrips,
          totalDistanceKm: preview.totals.totalDistanceKm,
          subtotalPaise: preview.totals.subtotalPaise,
          taxPaise: preview.totals.taxPaise,
          totalPaise: preview.totals.totalPaise,
          gstBps: preview.totals.gstBps,
          status: inserted.status,
          rateSnapshot: {
            billingBaseTripPaise: preview.vendor.billingBaseTripPaise,
            billingRatePerKmPaise: preview.vendor.billingRatePerKmPaise,
          },
          tripIds: preview.lineItems.map((l) => l.tripId),
        },
      });

      return inserted;
    });

    return {
      invoice: {
        ...created,
        vendorName: preview.vendor.name,
        vendorCode: preview.vendor.code,
      },
      totals: preview.totals,
      lineItems: preview.lineItems,
    };
  }

  async getInvoiceDetail(organizationId: string, invoiceId: string) {
    const [row] = await this.dbService.db
      .select({
        invoice: invoices,
        vendor: vendors,
      })
      .from(invoices)
      .innerJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Invoice ${invoiceId} not found in active organization.`,
      });
    }

    const inferredGstBps =
      row.invoice.subtotalPaise > 0
        ? Math.round((row.invoice.taxPaise * 10_000) / row.invoice.subtotalPaise)
        : 500;

    const [preview, historyRows] = await Promise.all([
      this.computeVendorPeriodPreview(
        organizationId,
        row.invoice.vendorId,
        row.invoice.periodStart,
        row.invoice.periodEnd,
        inferredGstBps,
      ),
      this.dbService.db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          actorRole: auditLogs.actorRole,
          reason: auditLogs.reason,
          beforeJson: auditLogs.beforeJson,
          afterJson: auditLogs.afterJson,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            eq(auditLogs.entityType, 'INVOICE'),
            eq(auditLogs.entityId, invoiceId),
          ),
        )
        .orderBy(desc(auditLogs.createdAt)),
    ]);

    return {
      invoice: {
        ...row.invoice,
        vendorName: row.vendor.name,
        vendorCode: row.vendor.code,
        contactName: row.vendor.contactName,
        contactPhone: row.vendor.contactPhone,
        billingBaseTripPaise: row.vendor.billingBaseTripPaise,
        billingRatePerKmPaise: row.vendor.billingRatePerKmPaise,
      },
      inferredGstBps,
      lineItems: preview.lineItems,
      cancelledOrAbortedCount: preview.cancelledOrAbortedCount,
      inFlightCount: preview.inFlightCount,
      auditHistory: historyRows,
    };
  }

  async updateInvoiceStatus(
    identity: RequestIdentity,
    invoiceId: string,
    dto: UpdateInvoiceStatusDto,
  ) {
    if (identity.role === 'VENDOR_SUPERVISOR' && dto.status !== 'DISPUTED') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Vendor supervisors can only raise a billing dispute; issuing or reconciling requires admin approval.',
      });
    }

    if (dto.status === 'DISPUTED' && (!dto.note || dto.note.trim().length < 3)) {
      throw new UnprocessableEntityException({
        code: 'DISPUTE_NOTE_REQUIRED',
        message: 'Provide a reconciliation note explaining the billing discrepancy.',
      });
    }

    const updated = await this.dbService.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.id, invoiceId), eq(invoices.organizationId, identity.organizationId)),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: `Invoice ${invoiceId} not found in active organization.`,
        });
      }

      const currentStatus = existing.status as InvoiceStatus;
      const allowed = INVOICE_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new ConflictException({
          code: 'INVALID_INVOICE_TRANSITION',
          message: `Cannot transition invoice from ${existing.status} to ${dto.status}.`,
        });
      }

      const [nextRow] = await tx
        .update(invoices)
        .set({
          status: dto.status,
          updatedAt: new Date(),
        })
        .where(
          and(eq(invoices.id, invoiceId), eq(invoices.organizationId, identity.organizationId)),
        )
        .returning();

      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'INVOICE_STATUS_CHANGED',
        entityType: 'INVOICE',
        entityId: invoiceId,
        reason: dto.note ?? null,
        beforeJson: { status: existing.status },
        afterJson: { status: dto.status },
      });

      return nextRow;
    });

    return updated;
  }

  async exportInvoiceCsv(organizationId: string, invoiceId: string) {
    const detail = await this.getInvoiceDetail(organizationId, invoiceId);
    const csv = formatInvoiceStatementCsv({
      invoiceNumber: detail.invoice.invoiceNumber,
      vendorName: detail.invoice.vendorName,
      vendorCode: detail.invoice.vendorCode,
      periodStart: detail.invoice.periodStart,
      periodEnd: detail.invoice.periodEnd,
      status: detail.invoice.status,
      currency: detail.invoice.currency,
      totals: {
        totalTrips: detail.invoice.totalTrips,
        totalDistanceKm: detail.invoice.totalDistanceKm,
        subtotalPaise: detail.invoice.subtotalPaise,
        taxPaise: detail.invoice.taxPaise,
        totalPaise: detail.invoice.totalPaise,
        gstBps: detail.inferredGstBps,
      },
      lineItems: detail.lineItems,
    });

    return {
      filename: `${detail.invoice.invoiceNumber}.csv`,
      csv,
    };
  }
}
