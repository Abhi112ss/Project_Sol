import 'package:material_ui/material_ui.dart';

import '../theme/color_tokens.dart';
import '../theme/typography_tokens.dart';
import 'buttons.dart';

/// Shared empty state panel with calm operational framing and optional CTA.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
      decoration: BoxDecoration(
        color: ColorTokens.surface,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border: Border.all(color: ColorTokens.borderSubtle, width: 1),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: ColorTokens.surfaceMuted,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 24, color: ColorTokens.inkSecondary),
          ),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: TypographyTokens.cardTitle),
          const SizedBox(height: 6),
          Text(message, textAlign: TextAlign.center, style: TypographyTokens.bodyMuted),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 18),
            PrimaryButton(
              label: actionLabel!,
              onPressed: onAction,
              fullWidth: false,
            ),
          ],
        ],
      ),
    );
  }
}

/// Shared skeleton pulse card list while fetching initial data cleanly.
class LoadingState extends StatefulWidget {
  const LoadingState({
    super.key,
    this.cardCount = 3,
    this.cardHeight = 112,
  });

  final int cardCount;
  final double cardHeight;

  @override
  State<LoadingState> createState() => _LoadingStateState();
}

class _LoadingStateState extends State<LoadingState> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
      lowerBound: 0.45,
      upperBound: 0.9,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    return Column(
      children: List.generate(widget.cardCount, (index) {
        final box = Container(
          height: widget.cardHeight,
          width: double.infinity,
          margin: EdgeInsets.only(bottom: index == widget.cardCount - 1 ? 0 : 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: ColorTokens.surface,
            borderRadius: const BorderRadius.all(Radius.circular(16)),
            border: Border.all(color: ColorTokens.borderSubtle, width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 140,
                height: 14,
                decoration: const BoxDecoration(
                  color: ColorTokens.surfaceMuted,
                  borderRadius: BorderRadius.all(Radius.circular(6)),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                height: 16,
                decoration: const BoxDecoration(
                  color: ColorTokens.surfaceMuted,
                  borderRadius: BorderRadius.all(Radius.circular(6)),
                ),
              ),
              const Spacer(),
              Container(
                width: 190,
                height: 12,
                decoration: const BoxDecoration(
                  color: ColorTokens.surfaceMuted,
                  borderRadius: BorderRadius.all(Radius.circular(6)),
                ),
              ),
            ],
          ),
        );

        if (reducedMotion) return box;
        return FadeTransition(opacity: _pulse, child: box);
      }),
    );
  }
}

/// Shared resilient operational error panel with one-tap retry CTA.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.title,
    required this.message,
    this.errorCode,
    this.onRetry,
  });

  final String title;
  final String message;
  final String? errorCode;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: ColorTokens.dangerSoft,
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        border: Border.all(color: ColorTokens.dangerBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline_rounded, size: 22, color: ColorTokens.dangerPressed),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: TypographyTokens.cardTitle.copyWith(color: ColorTokens.dangerPressed),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: TypographyTokens.body.copyWith(color: ColorTokens.inkPrimary),
          ),
          if (errorCode != null) ...[
            const SizedBox(height: 6),
            Text(
              'Code: $errorCode',
              style: TypographyTokens.label.copyWith(
                fontSize: 11.5,
                color: ColorTokens.dangerPressed,
                fontFeatures: TypographyTokens.tabularFeatures,
              ),
            ),
          ],
          if (onRetry != null) ...[
            const SizedBox(height: 14),
            SecondaryButton(
              label: 'Try Again',
              icon: Icons.refresh_rounded,
              onPressed: onRetry,
            ),
          ],
        ],
      ),
    );
  }
}

