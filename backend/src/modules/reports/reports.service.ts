import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { RequestIdentity } from '../../infrastructure/common/current-user.decorator.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import {
  bookings,
  drivers,
  employees,
  gpsLocations,
  invoices,
  noShowRecords,
  offices,
  otpRecords,
  passengerAssignments,
  safetyAlerts,
  shifts,
  trips,
  tripStops,
  users,
  vehicles,
  vendors,
} from '../../infrastructure/database/schema/index.js';
import { AuditLogsService } from '../audit-logs/audit-logs.module.js';
import {
  aggregateAnalytics,
  type AnalyticsDatasetInput,
  buildTypedReport,
  classifyAssistantQuestion,
  type ReportsAnalyticsBundle,
} from './reports.analytics.js';
import type {
  AssistantQueryDto,
  ReportsFilterQuery,
  ReportType,
} from './reports.schemas.js';

function formatIstDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private resolveDateRange(startDate?: string, endDate?: string): {
    periodStart: string;
    periodEnd: string;
  } {
    const now = new Date();
    const defaultEnd = formatIstDate(now);
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 86_400_000);
    const defaultStart = formatIstDate(thirtyDaysAgo);

    const periodStart = startDate ?? defaultStart;
    const periodEnd = endDate ?? defaultEnd;

    if (periodStart > periodEnd) {
      throw new UnprocessableEntityException({
        code: 'INVALID_PERIOD_RANGE',
        message: 'startDate must be on or before endDate.',
      });
    }

    return { periodStart, periodEnd };
  }

  private async loadDataset(
    organizationId: string,
    query: Omit<ReportsFilterQuery, 'format'>,
  ): Promise<AnalyticsDatasetInput> {
    const { periodStart, periodEnd } = this.resolveDateRange(query.startDate, query.endDate);

    const tripConditions = [
      eq(trips.organizationId, organizationId),
      gte(trips.travelDate, periodStart),
      lte(trips.travelDate, periodEnd),
    ];
    if (query.officeId) tripConditions.push(eq(trips.officeId, query.officeId));
    if (query.shiftId) tripConditions.push(eq(trips.shiftId, query.shiftId));
    if (query.vendorId) tripConditions.push(eq(trips.vendorId, query.vendorId));
    if (query.direction) tripConditions.push(eq(trips.direction, query.direction));

    const [tripRows, vendorsCatalog, vehiclesCatalog, driversCatalog, alertRows] =
      await Promise.all([
        this.dbService.db
          .select({
            trip: trips,
            officeName: offices.name,
            shiftName: shifts.name,
            shiftCode: shifts.code,
            shiftTimeLocal: shifts.shiftTimeLocal,
            vendorName: vendors.name,
            billingBaseTripPaise: vendors.billingBaseTripPaise,
            billingRatePerKmPaise: vendors.billingRatePerKmPaise,
            driverCode: drivers.driverCode,
            driverName: users.fullName,
            vehicleRegistrationNo: vehicles.registrationNo,
            vehicleType: vehicles.vehicleType,
            seatingCapacity: vehicles.seatingCapacity,
          })
          .from(trips)
          .innerJoin(offices, eq(offices.id, trips.officeId))
          .innerJoin(shifts, eq(shifts.id, trips.shiftId))
          .leftJoin(vendors, eq(vendors.id, trips.vendorId))
          .leftJoin(drivers, eq(drivers.id, trips.driverId))
          .leftJoin(users, eq(users.id, drivers.userId))
          .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
          .where(and(...tripConditions))
          .orderBy(asc(trips.travelDate), asc(trips.plannedStartAt)),
        this.dbService.db
          .select({
            id: vendors.id,
            name: vendors.name,
            code: vendors.code,
            billingBaseTripPaise: vendors.billingBaseTripPaise,
            billingRatePerKmPaise: vendors.billingRatePerKmPaise,
          })
          .from(vendors)
          .where(eq(vendors.organizationId, organizationId)),
        this.dbService.db
          .select({
            id: vehicles.id,
            registrationNo: vehicles.registrationNo,
            modelName: vehicles.modelName,
            vehicleType: vehicles.vehicleType,
            seatingCapacity: vehicles.seatingCapacity,
            availabilityStatus: vehicles.availabilityStatus,
            isActive: vehicles.isActive,
          })
          .from(vehicles)
          .where(eq(vehicles.organizationId, organizationId)),
        this.dbService.db
          .select({
            id: drivers.id,
            driverCode: drivers.driverCode,
            fullName: users.fullName,
            isSuspended: drivers.isSuspended,
            availabilityStatus: drivers.availabilityStatus,
          })
          .from(drivers)
          .innerJoin(users, eq(users.id, drivers.userId))
          .where(eq(drivers.organizationId, organizationId)),
        this.dbService.db
          .select({
            alertId: safetyAlerts.id,
            tripId: safetyAlerts.tripId,
            alertType: safetyAlerts.alertType,
            severity: safetyAlerts.severity,
            status: safetyAlerts.status,
            notes: safetyAlerts.notes,
            createdAt: safetyAlerts.createdAt,
          })
          .from(safetyAlerts)
          .where(eq(safetyAlerts.organizationId, organizationId))
          .orderBy(desc(safetyAlerts.createdAt))
          .limit(200),
      ]);

    const tripIds = tripRows.map((r) => r.trip.id);

    const [stopRows, gpsRows, assignmentRows, noShowRows] = await Promise.all([
      tripIds.length > 0
        ? this.dbService.db
            .select({
              tripId: tripStops.tripId,
              latitude: tripStops.latitude,
              longitude: tripStops.longitude,
              sequenceNo: tripStops.sequenceNo,
            })
            .from(tripStops)
            .where(inArray(tripStops.tripId, tripIds))
            .orderBy(asc(tripStops.tripId), asc(tripStops.sequenceNo))
        : Promise.resolve([]),
      tripIds.length > 0
        ? this.dbService.db
            .select({
              tripId: gpsLocations.tripId,
              latitude: gpsLocations.latitude,
              longitude: gpsLocations.longitude,
              recordedAt: gpsLocations.recordedAt,
            })
            .from(gpsLocations)
            .where(inArray(gpsLocations.tripId, tripIds))
            .orderBy(asc(gpsLocations.tripId), asc(gpsLocations.recordedAt))
        : Promise.resolve([]),
      tripIds.length > 0
        ? this.dbService.db
            .select({
              assignment: passengerAssignments,
              employeeCode: employees.employeeCode,
              employeeName: users.fullName,
              department: employees.department,
            })
            .from(passengerAssignments)
            .innerJoin(employees, eq(employees.id, passengerAssignments.employeeId))
            .innerJoin(users, eq(users.id, employees.userId))
            .where(inArray(passengerAssignments.tripId, tripIds))
        : Promise.resolve([]),
      tripIds.length > 0
        ? this.dbService.db
            .select({
              noShow: noShowRecords,
              employeeCode: employees.employeeCode,
              employeeName: users.fullName,
              travelDate: trips.travelDate,
            })
            .from(noShowRecords)
            .innerJoin(trips, eq(trips.id, noShowRecords.tripId))
            .innerJoin(employees, eq(employees.id, noShowRecords.employeeId))
            .innerJoin(users, eq(users.id, employees.userId))
            .where(inArray(noShowRecords.tripId, tripIds))
        : Promise.resolve([]),
    ]);

    const assignmentIds = assignmentRows.map((r) => r.assignment.id);
    const verifiedOtpRows =
      assignmentIds.length > 0
        ? await this.dbService.db
            .select({ passengerAssignmentId: otpRecords.passengerAssignmentId })
            .from(otpRecords)
            .where(
              and(
                inArray(otpRecords.passengerAssignmentId, assignmentIds),
                isNotNull(otpRecords.verifiedAt),
              ),
            )
        : [];
    const verifiedAssignmentSet = new Set(verifiedOtpRows.map((o) => o.passengerAssignmentId));

    const stopsByTrip = new Map<string, Array<{ latitude: number; longitude: number }>>();
    for (const s of stopRows) {
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

    const vendorByTrip = new Map(tripRows.map((r) => [r.trip.id, r.trip.vendorId]));

    return {
      periodStart,
      periodEnd,
      trips: tripRows.map((r) => ({
        tripId: r.trip.id,
        tripCode: r.trip.tripCode,
        travelDate: r.trip.travelDate,
        direction: r.trip.direction,
        status: r.trip.status,
        officeId: r.trip.officeId,
        officeName: r.officeName,
        shiftId: r.trip.shiftId,
        shiftName: r.shiftName,
        shiftCode: r.shiftCode,
        shiftTimeLocal: r.shiftTimeLocal,
        vendorId: r.trip.vendorId,
        vendorName: r.vendorName,
        driverId: r.trip.driverId,
        driverCode: r.driverCode,
        driverName: r.driverName,
        vehicleId: r.trip.vehicleId,
        vehicleRegistrationNo: r.vehicleRegistrationNo,
        vehicleType: r.vehicleType,
        seatingCapacity: r.seatingCapacity,
        billingBaseTripPaise: r.billingBaseTripPaise ?? 45000,
        billingRatePerKmPaise: r.billingRatePerKmPaise ?? 1800,
      })),
      assignments: assignmentRows.map((r) => ({
        assignmentId: r.assignment.id,
        tripId: r.assignment.tripId,
        employeeId: r.assignment.employeeId,
        employeeCode: r.employeeCode,
        employeeName: r.employeeName,
        department: r.department,
        status: r.assignment.status,
        arrivalDelaySeconds: r.assignment.arrivalDelaySeconds,
        passengerWaitSeconds: r.assignment.passengerWaitSeconds,
        runningLateEtaMinutes: r.assignment.runningLateEtaMinutes,
        otpVerified: verifiedAssignmentSet.has(r.assignment.id),
      })),
      stopsByTrip,
      gpsByTrip,
      noShows: noShowRows.map((r) => ({
        noShowId: r.noShow.id,
        tripId: r.noShow.tripId,
        employeeId: r.noShow.employeeId,
        employeeCode: r.employeeCode,
        employeeName: r.employeeName,
        reasonCode: r.noShow.reasonCode,
        appealStatus: r.noShow.appealStatus,
        geofenceVerified: r.noShow.geofenceVerified,
        waitedSeconds: r.noShow.waitedSeconds,
        travelDate: r.travelDate,
      })),
      safetyAlerts: alertRows
        .filter((a) => !a.tripId || tripIds.includes(a.tripId))
        .map((a) => ({
          alertId: a.alertId,
          tripId: a.tripId,
          vendorId: a.tripId ? (vendorByTrip.get(a.tripId) ?? null) : null,
          alertType: a.alertType,
          severity: a.severity,
          status: a.status,
          notes: a.notes,
          triggeredAt: a.createdAt.toISOString(),
        })),
      vendorsCatalog,
      vehiclesCatalog,
      driversCatalog,
    };
  }

  async getSummary(
    organizationId: string,
    query: Omit<ReportsFilterQuery, 'format'>,
  ): Promise<ReportsAnalyticsBundle> {
    const dataset = await this.loadDataset(organizationId, query);
    return aggregateAnalytics(dataset);
  }

  async getTypedReport(
    organizationId: string,
    reportType: ReportType,
    query: Omit<ReportsFilterQuery, 'format'>,
  ) {
    const bundle = await this.getSummary(organizationId, query);
    return buildTypedReport(reportType, bundle);
  }

  async queryAssistant(identity: RequestIdentity, dto: AssistantQueryDto) {
    const classified = classifyAssistantQuestion(dto.question);
    if (classified.blocked) {
      throw new ForbiddenException({
        code: 'ASSISTANT_READ_ONLY_POLICY',
        message: classified.reason,
      });
    }

    const bundle = await this.getSummary(identity.organizationId, {
      startDate: dto.startDate,
      endDate: dto.endDate,
      officeId: dto.officeId,
    });

    let answer = '';
    let highlights: string[] = [];
    let rows: Array<Record<string, unknown>> = [];

    switch (classified.intent) {
      case 'DELAYED_DRIVERS': {
        const delayedDrivers = bundle.driverPunctuality.filter(
          (d) => d.avgArrivalDelaySeconds > 120 || d.delayedStops > 0,
        );
        rows = delayedDrivers;
        answer =
          delayedDrivers.length === 0
            ? `No drivers exceeded the +120s arrival SLA threshold between ${bundle.periodStart} and ${bundle.periodEnd}.`
            : `${delayedDrivers.length} driver(s) recorded delays >120s between ${bundle.periodStart} and ${bundle.periodEnd}. Worst average arrival delay: ${delayedDrivers[0].driverName} (+${delayedDrivers[0].avgArrivalDelaySeconds}s).`;
        highlights = delayedDrivers
          .slice(0, 4)
          .map(
            (d) =>
              `${d.driverName} (${d.driverCode}): avg +${d.avgArrivalDelaySeconds}s across ${d.delayedStops} delayed pickup(s)`,
          );
        break;
      }

      case 'REPEATED_NOSHOWS': {
        rows = bundle.noShowBreakdown.repeatOffenders;
        const repeated = rows.filter((r) => Number(r.noShowCount) >= 2);
        answer =
          rows.length === 0
            ? `Zero verified no-show records exist between ${bundle.periodStart} and ${bundle.periodEnd}.`
            : repeated.length > 0
              ? `${repeated.length} employee(s) had 2+ no-shows (${bundle.noShowBreakdown.totalNoShows} total no-shows across ${bundle.noShowBreakdown.geofenceVerifiedPct}% geofence-verified stops).`
              : `${rows.length} employee(s) recorded 1 no-show in this window (zero repeat offenders with 2+).`;
        highlights = bundle.noShowBreakdown.repeatOffenders
          .slice(0, 4)
          .map(
            (e) =>
              `${e.employeeName} (${e.employeeCode}): ${e.noShowCount} no-show(s), ${e.overturnedCount} overturned`,
          );
        break;
      }

      case 'AVAILABLE_VEHICLES': {
        const [activeVehicles, busyTrips, pendingBookings] = await Promise.all([
          this.dbService.db
            .select()
            .from(vehicles)
            .where(
              and(eq(vehicles.organizationId, identity.organizationId), eq(vehicles.isActive, true)),
            ),
          this.dbService.db
            .select({ vehicleId: trips.vehicleId, travelDate: trips.travelDate, status: trips.status })
            .from(trips)
            .where(
              and(
                eq(trips.organizationId, identity.organizationId),
                inArray(trips.status, ['ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS']),
              ),
            ),
          this.dbService.db
            .select({ status: bookings.status })
            .from(bookings)
            .where(
              and(
                eq(bookings.organizationId, identity.organizationId),
                inArray(bookings.status, ['PENDING_APPROVAL', 'APPROVED']),
              ),
            ),
        ]);
        const available = activeVehicles.filter((v) => v.availabilityStatus === 'AVAILABLE');
        const totalSeats = available.reduce((s, v) => s + v.seatingCapacity, 0);
        rows = available.map((v) => ({
          registrationNo: v.registrationNo,
          modelName: v.modelName,
          vehicleType: v.vehicleType,
          seatingCapacity: v.seatingCapacity,
          availabilityStatus: v.availabilityStatus,
        }));
        answer = `${available.length} of ${activeVehicles.length} active vehicles are currently AVAILABLE (${totalSeats} total passenger seats). ${busyTrips.length} active/assigned trip(s) in queue and ${pendingBookings.length} booking(s) awaiting dispatch or approval.`;
        highlights = available
          .slice(0, 5)
          .map((v) => `${v.registrationNo} (${v.modelName}, ${v.seatingCapacity} seats)`);
        break;
      }

      case 'VENDOR_DELAY_RANKING': {
        const ranked = [...bundle.vendorPerformance].sort(
          (a, b) => b.avgArrivalDelaySeconds - a.avgArrivalDelaySeconds,
        );
        rows = ranked;
        answer =
          ranked.length === 0
            ? 'No vendor activity recorded in this period.'
            : `${ranked[0].vendorName} (${ranked[0].vendorCode}) leads arrival delay averages at +${ranked[0].avgArrivalDelaySeconds}s across ${ranked[0].delayedPickups} late pickup(s).`;
        highlights = ranked.map(
          (v) =>
            `${v.vendorName}: +${v.avgArrivalDelaySeconds}s avg delay, ${v.noShowRatePct}% no-show rate, ${v.safetyAlertsCount} safety alert(s)`,
        );
        break;
      }

      case 'SHIFT_DELAY_CAUSE': {
        rows = bundle.shiftDelayPatterns;
        const advisories = bundle.delayPredictions;
        const top = advisories[0];
        answer = top
          ? `${top.shiftName} (${top.shiftTimeLocal}) shows ${top.riskLevel} delay pressure (score ${top.riskScore}/100): ${top.rationale}`
          : 'No shift delay patterns detected in the selected window.';
        highlights = advisories
          .slice(0, 4)
          .map(
            (a) =>
              `${a.shiftCode} (${a.shiftTimeLocal}) · ${a.riskLevel}: ${a.rationale}`,
          );
        break;
      }

      case 'SAFETY_OVERVIEW': {
        const openOrAckAlerts = await this.dbService.db
          .select()
          .from(safetyAlerts)
          .where(eq(safetyAlerts.organizationId, identity.organizationId))
          .orderBy(desc(safetyAlerts.createdAt))
          .limit(20);
        rows = openOrAckAlerts.map((a) => ({
          id: a.id,
          alertType: a.alertType,
          severity: a.severity,
          status: a.status,
          triggeredAt: a.createdAt.toISOString(),
          notes: a.notes,
        }));
        const openCount = openOrAckAlerts.filter((a) => a.status !== 'RESOLVED').length;
        answer = `Found ${openCount} active (OPEN/ACKNOWLEDGED) safety alert(s) and ${openOrAckAlerts.length} recent record(s) total.`;
        highlights = openOrAckAlerts
          .slice(0, 4)
          .map((a) => `${a.alertType} (${a.severity} / ${a.status}): ${a.notes ?? 'No note'}`);
        break;
      }

      case 'BILLING_OVERVIEW': {
        const invRows = await this.dbService.db
          .select({
            invoiceNumber: invoices.invoiceNumber,
            status: invoices.status,
            periodStart: invoices.periodStart,
            periodEnd: invoices.periodEnd,
            totalTrips: invoices.totalTrips,
            totalDistanceKm: invoices.totalDistanceKm,
            totalPaise: invoices.totalPaise,
          })
          .from(invoices)
          .where(eq(invoices.organizationId, identity.organizationId))
          .orderBy(desc(invoices.createdAt))
          .limit(20);
        rows = invRows;
        const totalBilledInr = (
          invRows.reduce((s, r) => s + r.totalPaise, 0) / 100
        ).toFixed(2);
        answer = `${invRows.length} vendor invoice(s) stored totaling INR ${totalBilledInr}. Estimated completed trip spend in analytics window is INR ${(bundle.overview.estimatedTotalCostPaise / 100).toFixed(2)}.`;
        highlights = invRows
          .slice(0, 4)
          .map(
            (i) =>
              `${i.invoiceNumber} [${i.status}]: ${i.totalTrips} trips · INR ${(i.totalPaise / 100).toFixed(2)}`,
          );
        break;
      }

      case 'GENERAL_OVERVIEW': {
        rows = bundle.shiftDelayPatterns;
        answer = `Window ${bundle.periodStart} to ${bundle.periodEnd}: ${bundle.overview.completedTrips}/${bundle.overview.totalTrips} completed trips (${bundle.overview.completionRatePct}%), ${bundle.overview.onTimePct}% on-time pickups (+${bundle.overview.avgArrivalDelaySeconds}s avg driver delay vs ${bundle.overview.avgWaitSeconds}s avg passenger wait), and ${bundle.overview.otpCompliancePct}% OTP compliance.`;
        highlights = [
          `On-time pickups: ${bundle.overview.onTimePickups} / ${bundle.overview.evaluatedArrivalsCount}`,
          `Verified no-shows: ${bundle.overview.noShowRiders}`,
          `Estimated transport cost: INR ${(bundle.overview.estimatedTotalCostPaise / 100).toFixed(2)}`,
        ];
        break;
      }
    }

    await this.dbService.db.transaction(async (tx) => {
      await this.auditLogs.recordInTx(tx, {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        action: 'AI_ASSISTANT_QUERY_EXECUTED',
        entityType: 'OPERATIONAL_ANALYTICS',
        entityId: identity.organizationId,
        reason: dto.question,
        afterJson: {
          intent: classified.intent,
          periodStart: bundle.periodStart,
          periodEnd: bundle.periodEnd,
          returnedRowsCount: rows.length,
        },
      });
    });

    return {
      intent: classified.intent,
      guardedReadOnly: true,
      mode: 'DETERMINISTIC_LOCAL',
      periodStart: bundle.periodStart,
      periodEnd: bundle.periodEnd,
      answer,
      highlights,
      rows,
    };
  }
}
