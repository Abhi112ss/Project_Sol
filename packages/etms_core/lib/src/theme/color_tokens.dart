import 'package:material_ui/material_ui.dart';

/// Shared Harbor Pilot Dispatch & Bridge Telemetry color tokens.
/// Designed for daylight outdoor glare legibility in field transit apps.
abstract final class ColorTokens {
  // Surfaces & Canvas
  static const Color canvas = Color(0xFFF7F9FC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F5F9);
  static const Color surfaceElevated = Color(0xFFF8FAFC);

  // Borders & Dividers
  static const Color borderSubtle = Color(0xFFD9E2EC);
  static const Color borderStrong = Color(0xFFBCCCDC);

  // Ink Hierarchy (High Contrast Daylight Slate / Prussian Navy)
  static const Color inkPrimary = Color(0xFF0F2544);
  static const Color inkSecondary = Color(0xFF475569);
  static const Color inkMuted = Color(0xFF64748B);

  // Brand Primary (Harbor Cobalt)
  static const Color primary = Color(0xFF2563EB);
  static const Color primaryPressed = Color(0xFF1D4ED8);
  static const Color primarySoft = Color(0xFFEFF6FF);
  static const Color primaryBorder = Color(0xFFBFDBFE);

  // Semantic States
  static const Color success = Color(0xFF059669);
  static const Color successSoft = Color(0xFFECFDF5);
  static const Color successBorder = Color(0xFFA7F3D0);

  static const Color warning = Color(0xFFD97706);
  static const Color warningSoft = Color(0xFFFFFBEB);
  static const Color warningBorder = Color(0xFFFDE68A);

  static const Color danger = Color(0xFFDC2626);
  static const Color dangerPressed = Color(0xFFB91C1C);
  static const Color dangerSoft = Color(0xFFFEF2F2);
  static const Color dangerBorder = Color(0xFFFECACA);

  static const Color neutral = Color(0xFF64748B);
  static const Color neutralSoft = Color(0xFFF1F5F9);
  static const Color neutralBorder = Color(0xFFE2E8F0);
}

