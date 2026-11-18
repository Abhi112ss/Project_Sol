import 'dart:ui';

import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../theme/color_tokens.dart';

/// Interaction Brief (Apple Design + Emil Kowalski Design Engineering):
/// 1. Trigger: Pointer down (`onTapDown`) on primary controls, ride cards, & action chips.
/// 2. Target: Immediate compression (`scale = 0.97`), haptic tick on commit, zero `scale(0)`.
/// 3. Spring: Critically damped spring (`dampingRatio = 1.0`, `stiffness = 460`) for snap-back.
/// 4. Accessibility: Honors `disableAnimationsOf` (crossfade/instant) & `highContrastOf` (solid fill).
abstract final class HarborMotion {
  static const SpringDescription snappySpring = SpringDescription(
    mass: 1.0,
    stiffness: 460.0,
    damping: 42.9, // ~1.0 damping ratio (critically damped, zero overshoot)
  );

  static const Duration fastDuration = Duration(milliseconds: 160);
  static const Duration surfaceDuration = Duration(milliseconds: 220);
  static const Curve easeOutCurve = Curves.easeOutCubic;

  static Future<void> hapticSelection() async {
    try {
      await HapticFeedback.selectionClick();
    } catch (_) {
      // Safe no-op in headless widget tests / unsupported platforms.
    }
  }

  static Future<void> hapticAlert() async {
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {
      // Safe no-op in headless widget tests / unsupported platforms.
    }
  }
}

/// Immediate pointer-down feedback surface (`scale(0.97)` on press, critically
/// damped spring release) modeled on Apple fluid buttons & interactive cards.
class HarborPressable extends StatefulWidget {
  const HarborPressable({
    super.key,
    required this.child,
    this.onTap,
    this.pressedScale = 0.97,
    this.enableHaptics = true,
    this.borderRadius = const BorderRadius.all(Radius.circular(14)),
    this.semanticLabel,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double pressedScale;
  final bool enableHaptics;
  final BorderRadius borderRadius;
  final String? semanticLabel;

  @override
  State<HarborPressable> createState() => _HarborPressableState();
}

class _HarborPressableState extends State<HarborPressable> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      value: 1.0,
      lowerBound: 0.9,
      upperBound: 1.0,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _animateTo(double target) {
    final reducedMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reducedMotion) {
      _controller.value = 1.0;
      return;
    }
    _controller.animateWith(
      SpringSimulation(HarborMotion.snappySpring, _controller.value, target, 0.0),
    );
  }

  void _handleTapDown(TapDownDetails _) {
    if (widget.onTap == null) return;
    _animateTo(widget.pressedScale);
  }

  void _handleTapUp(TapUpDetails _) {
    _animateTo(1.0);
  }

  void _handleTapCancel() {
    _animateTo(1.0);
  }

  void _handleTap() {
    if (widget.onTap == null) return;
    if (widget.enableHaptics) {
      HarborMotion.hapticSelection();
    }
    widget.onTap!();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: widget.onTap != null,
      label: widget.semanticLabel,
      child: ScaleTransition(
        scale: _controller,
        child: Material(
          color: Colors.transparent,
          borderRadius: widget.borderRadius,
          child: InkWell(
            onTap: widget.onTap == null ? null : _handleTap,
            onTapDown: _handleTapDown,
            onTapUp: _handleTapUp,
            onTapCancel: _handleTapCancel,
            borderRadius: widget.borderRadius,
            splashFactory: InkSparkle.splashFactory,
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// Translucent floating overlay surface with automatic opaque high-contrast fallback
/// for SOS bars, map overlays, and bottom floating action chrome.
class HarborGlassSurface extends StatelessWidget {
  const HarborGlassSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.borderRadius = const BorderRadius.all(Radius.circular(16)),
    this.borderColor = ColorTokens.borderSubtle,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final BorderRadius borderRadius;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final highContrast = MediaQuery.maybeHighContrastOf(context) ?? false;
    if (highContrast) {
      return Container(
        padding: padding,
        decoration: BoxDecoration(
          color: ColorTokens.surface,
          borderRadius: borderRadius,
          border: Border.all(color: ColorTokens.borderStrong, width: 1.2),
        ),
        child: child,
      );
    }

    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: ColorTokens.surface.withValues(alpha: 0.88),
            borderRadius: borderRadius,
            border: Border.all(color: borderColor, width: 1),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Subtle entrance helper starting from 0.96 scale + slight vertical offset (never scale 0).
class HarborEnterTransition extends StatelessWidget {
  const HarborEnterTransition({
    super.key,
    required this.child,
    this.duration = HarborMotion.surfaceDuration,
  });

  final Widget child;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reducedMotion) return child;

    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: 1.0),
      duration: duration,
      curve: HarborMotion.easeOutCurve,
      builder: (context, t, inner) {
        return Opacity(
          opacity: t.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1.0 - t) * 8.0),
            child: Transform.scale(
              scale: 0.96 + (0.04 * t),
              child: inner,
            ),
          ),
        );
      },
      child: child,
    );
  }
}

