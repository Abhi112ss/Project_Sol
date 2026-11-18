import 'package:material_ui/material_ui.dart';

import '../motion/harbor_motion.dart';
import '../theme/color_tokens.dart';

/// Primary CTA button enforcing >= 48dp touch height, Harbor tactile press
/// response, and stable layout width during loading transitions.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.isDanger = false,
    this.fullWidth = true,
    this.semanticLabel,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isLoading;
  final bool isDanger;
  final bool fullWidth;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;
    final bgColor = isDanger ? ColorTokens.danger : ColorTokens.primary;
    final effectiveBg = enabled ? bgColor : ColorTokens.neutralBorder;
    final effectiveFg = enabled ? Colors.white : ColorTokens.inkMuted;

    final content = AnimatedContainer(
      duration: HarborMotion.fastDuration,
      curve: HarborMotion.easeOutCurve,
      constraints: const BoxConstraints(minHeight: 48, minWidth: 88),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        color: effectiveBg,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
      ),
      child: Row(
        mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (isLoading) ...[
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: effectiveFg,
              ),
            ),
            const SizedBox(width: 10),
          ] else if (icon != null) ...[
            Icon(icon, size: 18, color: effectiveFg),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.05,
                color: effectiveFg,
              ),
            ),
          ),
        ],
      ),
    );

    return HarborPressable(
      onTap: enabled ? onPressed : null,
      semanticLabel: semanticLabel ?? label,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: fullWidth ? SizedBox(width: double.infinity, child: content) : content,
    );
  }
}

/// Outlined secondary button enforcing >= 48dp height and crisp 1px borders.
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.isDanger = false,
    this.isLoading = false,
    this.fullWidth = false,
    this.semanticLabel,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isDanger;
  final bool isLoading;
  final bool fullWidth;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;
    final fgColor = !enabled
        ? ColorTokens.inkMuted
        : isDanger
            ? ColorTokens.danger
            : ColorTokens.inkPrimary;
    final borderColor = !enabled
        ? ColorTokens.neutralBorder
        : isDanger
            ? ColorTokens.dangerBorder
            : ColorTokens.borderStrong;
    final bgColor = isDanger && enabled ? ColorTokens.dangerSoft : ColorTokens.surface;

    final content = AnimatedContainer(
      duration: HarborMotion.fastDuration,
      curve: HarborMotion.easeOutCurve,
      constraints: const BoxConstraints(minHeight: 48, minWidth: 88),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        border: Border.all(color: borderColor, width: 1),
      ),
      child: Row(
        mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (isLoading) ...[
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: fgColor),
            ),
            const SizedBox(width: 8),
          ] else if (icon != null) ...[
            Icon(icon, size: 18, color: fgColor),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: fgColor,
              ),
            ),
          ),
        ],
      ),
    );

    return HarborPressable(
      onTap: enabled ? onPressed : null,
      semanticLabel: semanticLabel ?? label,
      borderRadius: const BorderRadius.all(Radius.circular(14)),
      child: fullWidth ? SizedBox(width: double.infinity, child: content) : content,
    );
  }
}

