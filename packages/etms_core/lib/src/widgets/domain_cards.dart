import 'package:material_ui/material_ui.dart';

import '../motion/harbor_motion.dart';
import '../theme/color_tokens.dart';
import '../theme/typography_tokens.dart';
import 'status_indicators.dart';

/// Shared summary card for an assigned or historical shift commute trip.
class TripCard extends StatelessWidget {
  const TripCard({
    super.key,
    required this.tripCode,
    required this.travelDate,
    required this.direction,
    required this.status,
    required this.shiftLabel,
    required this.pickupLabel,
    this.officeLabel,
    this.driverSummary,
    this.vehicleSummary,
    this.etaLabel,
    this.trailing,
    this.onTap,
  });

  final String tripCode;
  final String travelDate;
  final String direction;
  final String status;
  final String shiftLabel;
  final String pickupLabel;
  final String? officeLabel;
  final String? driverSummary;
  final String? vehicleSummary;
  final String? etaLabel;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isLogin = direction.toUpperCase() == 'LOGIN';

    return HarborPressable(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(16)),
      semanticLabel: '$tripCode $direction ride on $travelDate',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ColorTokens.surface,
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          border: Border.all(color: ColorTokens.borderSubtle, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isLogin ? ColorTokens.primarySoft : ColorTokens.surfaceMuted,
                    borderRadius: const BorderRadius.all(Radius.circular(8)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isLogin ? Icons.login_rounded : Icons.logout_rounded,
                        size: 14,
                        color: isLogin ? ColorTokens.primaryPressed : ColorTokens.inkSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isLogin ? 'LOGIN' : 'LOGOUT',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: isLogin ? ColorTokens.primaryPressed : ColorTokens.inkSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '$travelDate · $shiftLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TypographyTokens.telemetryTabular.copyWith(fontSize: 13.5),
                  ),
                ),
                const SizedBox(width: 8),
                StatusBadge.fromStatus(status),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.location_on_outlined, size: 18, color: ColorTokens.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pickupLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TypographyTokens.cardTitle.copyWith(fontSize: 15),
                      ),
                      if (officeLabel != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          isLogin ? 'To $officeLabel' : 'From $officeLabel',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TypographyTokens.bodyMuted,
                        ),
                      ],
                    ],
                  ),
                ),
                if (etaLabel != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    etaLabel!,
                    style: TypographyTokens.telemetryTabular.copyWith(
                      fontSize: 14,
                      color: ColorTokens.inkPrimary,
                    ),
                  ),
                ],
              ],
            ),
            if (driverSummary != null || vehicleSummary != null) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.directions_car_outlined, size: 16, color: ColorTokens.inkMuted),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      [?driverSummary, ?vehicleSummary].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TypographyTokens.bodyMuted,
                    ),
                  ),
                  Text(
                    tripCode,
                    style: TypographyTokens.label.copyWith(
                      fontSize: 11,
                      color: ColorTokens.inkMuted,
                      fontFeatures: TypographyTokens.tabularFeatures,
                    ),
                  ),
                ],
              ),
            ],
            if (trailing != null) ...[
              const SizedBox(height: 12),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Shared passenger stop/assignment row supporting masked co-passenger privacy.
class PassengerCard extends StatelessWidget {
  const PassengerCard({
    super.key,
    required this.sequenceNo,
    required this.title,
    required this.subtitle,
    required this.status,
    this.isHighlighted = false,
    this.scheduledTimeLabel,
    this.delayNote,
    this.onTap,
  });

  final int sequenceNo;
  final String title;
  final String subtitle;
  final String status;
  final bool isHighlighted;
  final String? scheduledTimeLabel;
  final String? delayNote;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return HarborPressable(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isHighlighted ? ColorTokens.primarySoft : ColorTokens.surface,
          borderRadius: const BorderRadius.all(Radius.circular(14)),
          border: Border.all(
            color: isHighlighted ? ColorTokens.primaryBorder : ColorTokens.borderSubtle,
            width: isHighlighted ? 1.4 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isHighlighted ? ColorTokens.primary : ColorTokens.surfaceMuted,
                shape: BoxShape.circle,
              ),
              child: Text(
                '$sequenceNo',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  fontFeatures: TypographyTokens.tabularFeatures,
                  color: isHighlighted ? Colors.white : ColorTokens.inkPrimary,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TypographyTokens.cardTitle.copyWith(fontSize: 14.5),
                        ),
                      ),
                      const SizedBox(width: 8),
                      StatusBadge.fromStatus(status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TypographyTokens.bodyMuted),
                  if (scheduledTimeLabel != null || delayNote != null) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        if (scheduledTimeLabel != null)
                          Text(
                            scheduledTimeLabel!,
                            style: TypographyTokens.telemetryTabular.copyWith(
                              fontSize: 12,
                              color: ColorTokens.inkSecondary,
                            ),
                          ),
                        if (delayNote != null)
                          Text(
                            delayNote!,
                            style: TypographyTokens.label.copyWith(
                              fontSize: 11.5,
                              color: ColorTokens.warning,
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shared fleet vehicle identity badge card.
class VehicleCard extends StatelessWidget {
  const VehicleCard({
    super.key,
    required this.registrationNo,
    required this.modelName,
    this.vehicleType,
    this.seatingCapacity,
  });

  final String registrationNo;
  final String modelName;
  final String? vehicleType;
  final int? seatingCapacity;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surfaceElevated,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              color: ColorTokens.surface,
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
            child: const Icon(Icons.directions_car_filled_rounded, color: ColorTokens.inkPrimary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  registrationNo,
                  style: TypographyTokens.telemetryTabular.copyWith(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    modelName,
                    ?vehicleType,
                    if (seatingCapacity != null) '$seatingCapacity seats',
                  ].join(' · '),
                  style: TypographyTokens.bodyMuted,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Shared driver contact card with 48dp touch-safe Call action.
class DriverCard extends StatelessWidget {
  const DriverCard({
    super.key,
    required this.driverName,
    this.driverCode,
    this.vehicleRegistration,
    this.vehicleModel,
    this.onCallPressed,
  });

  final String driverName;
  final String? driverCode;
  final String? vehicleRegistration;
  final String? vehicleModel;
  final VoidCallback? onCallPressed;

  @override
  Widget build(BuildContext context) {
    final initials = driverName
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((p) => p.isEmpty ? '' : p[0].toUpperCase())
        .join();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: ColorTokens.primarySoft,
            child: Text(
              initials.isEmpty ? 'D' : initials,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: ColorTokens.primaryPressed,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(driverName, style: TypographyTokens.cardTitle.copyWith(fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  [
                    ?vehicleRegistration,
                    ?vehicleModel,
                    if (vehicleRegistration == null) ?driverCode,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypographyTokens.bodyMuted,
                ),
              ],
            ),
          ),
          if (onCallPressed != null) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: 48,
              height: 48,
              child: IconButton.filledTonal(
                onPressed: onCallPressed,
                tooltip: 'Call driver',
                style: IconButton.styleFrom(
                  backgroundColor: ColorTokens.successSoft,
                  foregroundColor: const Color(0xFF047857),
                ),
                icon: const Icon(Icons.call_rounded, size: 20),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Shared operational notification feed row.
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.title,
    required this.body,
    required this.category,
    required this.timestampLabel,
    required this.isRead,
    this.onTap,
  });

  final String title;
  final String body;
  final String category;
  final String timestampLabel;
  final bool isRead;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (icon, iconColor, bg) = switch (category.toUpperCase()) {
      'TRIP_DISPATCHED' || 'TRIP_STARTED' => (
          Icons.directions_car_rounded,
          ColorTokens.primary,
          ColorTokens.primarySoft,
        ),
      'PASSENGER_CANCELLED' || 'SAFETY_SOS' || 'TRIP_ABORTED' => (
          Icons.warning_amber_rounded,
          ColorTokens.danger,
          ColorTokens.dangerSoft,
        ),
      'DRIVER_ARRIVED' || 'BOOKING_APPROVED' => (
          Icons.verified_rounded,
          ColorTokens.success,
          ColorTokens.successSoft,
        ),
      _ => (
          Icons.notifications_none_rounded,
          ColorTokens.inkSecondary,
          ColorTokens.surfaceMuted,
        ),
    };

    return HarborPressable(
      onTap: onTap,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isRead ? ColorTokens.surface : ColorTokens.primarySoft.withValues(alpha: 0.45),
          borderRadius: const BorderRadius.all(Radius.circular(14)),
          border: Border.all(
            color: isRead ? ColorTokens.borderSubtle : ColorTokens.primaryBorder,
            width: 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: bg, borderRadius: const BorderRadius.all(Radius.circular(10))),
              child: Icon(icon, size: 19, color: iconColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: TypographyTokens.cardTitle.copyWith(
                            fontSize: 14.5,
                            fontWeight: isRead ? FontWeight.w600 : FontWeight.w700,
                          ),
                        ),
                      ),
                      if (!isRead) ...[
                        const SizedBox(width: 8),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: ColorTokens.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(body, style: TypographyTokens.bodyMuted),
                  const SizedBox(height: 6),
                  Text(
                    timestampLabel,
                    style: TypographyTokens.label.copyWith(
                      fontSize: 11.5,
                      color: ColorTokens.inkMuted,
                      fontFeatures: TypographyTokens.tabularFeatures,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
