import 'package:material_ui/material_ui.dart';
import 'color_tokens.dart';

/// Shared typography scale following Harbor Pilot optical sizing & tabular numerals.
/// Uses standard logical pixels so Android `sp` accessibility scaling works automatically.
abstract final class TypographyTokens {
  static const List<FontFeature> tabularFeatures = <FontFeature>[
    FontFeature.tabularFigures(),
  ];

  static const TextStyle displayTitle = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.2,
    color: ColorTokens.inkPrimary,
  );

  static const TextStyle sectionTitle = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.35,
    height: 1.25,
    color: ColorTokens.inkPrimary,
  );

  static const TextStyle cardTitle = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    height: 1.35,
    color: ColorTokens.inkPrimary,
  );

  static const TextStyle body = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.0,
    height: 1.45,
    color: ColorTokens.inkPrimary,
  );

  static const TextStyle bodyMuted = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.0,
    height: 1.45,
    color: ColorTokens.inkSecondary,
  );

  static const TextStyle label = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.15,
    height: 1.3,
    color: ColorTokens.inkSecondary,
  );

  static const TextStyle telemetryTabular = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.0,
    height: 1.3,
    fontFeatures: tabularFeatures,
    color: ColorTokens.inkPrimary,
  );

  static const TextStyle otpHero = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: 3.5,
    height: 1.15,
    fontFeatures: tabularFeatures,
    color: ColorTokens.inkPrimary,
  );

  static TextTheme buildTextTheme() {
    return const TextTheme(
      headlineLarge: displayTitle,
      headlineSmall: sectionTitle,
      titleMedium: cardTitle,
      bodyLarge: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        height: 1.45,
        color: ColorTokens.inkPrimary,
      ),
      bodyMedium: body,
      bodySmall: bodyMuted,
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.05,
        color: ColorTokens.inkPrimary,
      ),
      labelMedium: label,
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.25,
        color: ColorTokens.inkMuted,
      ),
    );
  }
}
