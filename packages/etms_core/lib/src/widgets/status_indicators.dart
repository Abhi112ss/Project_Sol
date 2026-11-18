import 'package:material_ui/material_ui.dart';

import '../theme/color_tokens.dart';
import '../theme/typography_tokens.dart';

enum StatusTone { neutral, info, success, warning, danger }

/// Shared high-contrast pill badge for trip, booking, passenger & safety states.
class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    this.tone = StatusTone.neutral,
    this.icon,
    this.showDot = true,
  });

  factory StatusBadge.fromStatus(String rawStatus, {Key? key}) {
    final normalized = rawStatus.trim().toUpperCase();
    return switch (normalized) {
      'IN_PROGRESS' || 'EN_ROUTE' => StatusBadge(
          key: key,
          label: normalized == 'IN_PROGRESS' ? 'In Transit' : 'En Route',
          tone: StatusTone.info,
        ),
      'BOARDED' || 'COMPLETED' || 'APPROVED' || 'DISPATCHED' || 'DROPPED' || 'RESOLVED' || 'ACTIVE' =>
        StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.success,
        ),
      'EXPIRED' => StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.neutral,
        ),
      'DRIVER_ACCEPTED' || 'ASSIGNED' || 'SCHEDULED' => StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.info,
        ),
      'PENDING_APPROVAL' || 'ARRIVED' || 'ACKNOWLEDGED' || 'CREATED' => StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.warning,
        ),
      'CANCELLED' || 'ABORTED' || 'NO_SHOW' || 'REJECTED' || 'OPEN' || 'SOS' => StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.danger,
        ),
      _ => StatusBadge(
          key: key,
          label: _prettyLabel(normalized),
          tone: StatusTone.neutral,
        ),
    };
  }

  final String label;
  final StatusTone tone;
  final IconData? icon;
  final bool showDot;

  static String _prettyLabel(String code) {
    return switch (code) {
      'PENDING_APPROVAL' => 'Pending Approval',
      'DRIVER_ACCEPTED' => 'Driver Accepted',
      'IN_PROGRESS' => 'In Transit',
      'EN_ROUTE' => 'En Route',
      'NO_SHOW' => 'No Show',
      'SAFE_REACH_OVERDUE' => 'Safe-Reach Overdue',
      _ => code
          .split('_')
          .map((p) => p.isEmpty ? p : '${p[0]}${p.substring(1).toLowerCase()}')
          .join(' '),
    };
  }

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg) = switch (tone) {
      StatusTone.success => (
          ColorTokens.successSoft,
          ColorTokens.successBorder,
          const Color(0xFF047857),
        ),
      StatusTone.warning => (
          ColorTokens.warningSoft,
          ColorTokens.warningBorder,
          const Color(0xFFB45309),
        ),
      StatusTone.danger => (
          ColorTokens.dangerSoft,
          ColorTokens.dangerBorder,
          ColorTokens.dangerPressed,
        ),
      StatusTone.info => (
          ColorTokens.primarySoft,
          ColorTokens.primaryBorder,
          ColorTokens.primaryPressed,
        ),
      StatusTone.neutral => (
          ColorTokens.neutralSoft,
          ColorTokens.neutralBorder,
          const Color(0xFF334155),
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 5),
          ] else if (showDot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

enum GpsFreshness { live, stale, unavailable }

/// Truthful GPS signal freshness pill. Never fabricates live pings when absent.
class GPSStatusIndicator extends StatelessWidget {
  const GPSStatusIndicator({
    super.key,
    required this.freshness,
    this.ageSeconds,
    this.compact = false,
  });

  factory GPSStatusIndicator.fromTelemetry({
    Key? key,
    required int? ageSeconds,
    required bool isStale,
    bool compact = false,
  }) {
    if (ageSeconds == null) {
      return GPSStatusIndicator(
        key: key,
        freshness: GpsFreshness.unavailable,
        compact: compact,
      );
    }
    return GPSStatusIndicator(
      key: key,
      freshness: isStale ? GpsFreshness.stale : GpsFreshness.live,
      ageSeconds: ageSeconds,
      compact: compact,
    );
  }

  final GpsFreshness freshness;
  final int? ageSeconds;
  final bool compact;

  String _formatAge(int? seconds) {
    if (seconds == null) return '';
    if (seconds < 60) return '${seconds}s ago';
    final mins = seconds ~/ 60;
    if (mins < 60) return '${mins}m ago';
    return '${mins ~/ 60}h ago';
  }

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg, icon, text) = switch (freshness) {
      GpsFreshness.live => (
          ColorTokens.successSoft,
          ColorTokens.successBorder,
          const Color(0xFF047857),
          Icons.gps_fixed_rounded,
          compact ? 'GPS Live' : 'LIVE GPS · ${_formatAge(ageSeconds)}',
        ),
      GpsFreshness.stale => (
          ColorTokens.warningSoft,
          ColorTokens.warningBorder,
          const Color(0xFFB45309),
          Icons.gps_not_fixed_rounded,
          compact ? 'GPS Stale' : 'STALE SIGNAL · ${_formatAge(ageSeconds)}',
        ),
      GpsFreshness.unavailable => (
          ColorTokens.neutralSoft,
          ColorTokens.neutralBorder,
          ColorTokens.inkSecondary,
          Icons.gps_off_rounded,
          compact ? 'Schedule ETA' : 'NO LIVE SIGNAL · Schedule ETA',
        ),
    };

    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        border: Border.all(color: border, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TypographyTokens.label.copyWith(
                fontSize: 11.5,
                color: fg,
                fontFeatures: TypographyTokens.tabularFeatures,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Persistent connectivity notice displayed when network connection drops.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({
    super.key,
    this.isOffline = false,
    this.message = 'Offline · Showing cached commute schedule. Actions pause until reconnected.',
    this.onRetry,
  });

  final bool isOffline;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (!isOffline) return const SizedBox.shrink();

    return Material(
      color: ColorTokens.inkPrimary,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.wifi_off_rounded, size: 18, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                    height: 1.35,
                  ),
                ),
              ),
              if (onRetry != null)
                TextButton(
                  onPressed: onRetry,
                  style: TextButton.styleFrom(
                    foregroundColor: ColorTokens.primaryBorder,
                    minimumSize: const Size(48, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  child: const Text('Retry'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
