import 'package:material_ui/material_ui.dart';
import 'color_tokens.dart';
import 'typography_tokens.dart';

/// Shared Material 3 Light Enterprise theme aligned with Harbor Pilot Dispatch &
/// Apple fluid craft (high contrast, subtle 1px borders, clean mineral surfaces).
abstract final class AppTheme {
  static ThemeData light() {
    const colorScheme = ColorScheme.light(
      primary: ColorTokens.primary,
      onPrimary: Colors.white,
      primaryContainer: ColorTokens.primarySoft,
      onPrimaryContainer: ColorTokens.inkPrimary,
      secondary: ColorTokens.inkPrimary,
      onSecondary: Colors.white,
      secondaryContainer: ColorTokens.surfaceMuted,
      onSecondaryContainer: ColorTokens.inkPrimary,
      tertiary: ColorTokens.success,
      onTertiary: Colors.white,
      error: ColorTokens.danger,
      onError: Colors.white,
      errorContainer: ColorTokens.dangerSoft,
      onErrorContainer: ColorTokens.dangerPressed,
      surface: ColorTokens.surface,
      onSurface: ColorTokens.inkPrimary,
      onSurfaceVariant: ColorTokens.inkSecondary,
      surfaceContainerLowest: ColorTokens.surface,
      surfaceContainerLow: ColorTokens.surfaceElevated,
      surfaceContainer: ColorTokens.surfaceMuted,
      outline: ColorTokens.borderSubtle,
      outlineVariant: ColorTokens.neutralBorder,
    );

    final textTheme = TypographyTokens.buildTextTheme();
    const borderRadius12 = BorderRadius.all(Radius.circular(12));
    const borderRadius16 = BorderRadius.all(Radius.circular(16));

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: ColorTokens.canvas,
      textTheme: textTheme,
      dividerTheme: const DividerThemeData(
        color: ColorTokens.borderSubtle,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: ColorTokens.canvas,
        foregroundColor: ColorTokens.inkPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TypographyTokens.sectionTitle,
      ),
      cardTheme: const CardThemeData(
        color: ColorTokens.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: borderRadius16,
          side: BorderSide(color: ColorTokens.borderSubtle, width: 1),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: ColorTokens.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        indicatorColor: ColorTokens.primarySoft,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final isSelected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11.5,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? ColorTokens.primary : ColorTokens.inkSecondary,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final isSelected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: 22,
            color: isSelected ? ColorTokens.primary : ColorTokens.inkSecondary,
          );
        }),
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: ColorTokens.surface,
        indicatorColor: ColorTokens.primarySoft,
        selectedIconTheme: IconThemeData(color: ColorTokens.primary, size: 22),
        unselectedIconTheme: IconThemeData(color: ColorTokens.inkSecondary, size: 22),
        selectedLabelTextStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: ColorTokens.primary,
        ),
        unselectedLabelTextStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: ColorTokens.inkSecondary,
        ),
      ),
      inputDecorationTheme: const InputDecorationThemeData(
        filled: true,
        fillColor: ColorTokens.surface,
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: TextStyle(color: ColorTokens.inkMuted, fontSize: 14),
        labelStyle: TextStyle(color: ColorTokens.inkSecondary, fontSize: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: borderRadius12,
          borderSide: BorderSide(color: ColorTokens.borderSubtle, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: borderRadius12,
          borderSide: BorderSide(color: ColorTokens.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: borderRadius12,
          borderSide: BorderSide(color: ColorTokens.danger, width: 1.2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: borderRadius12,
          borderSide: BorderSide(color: ColorTokens.danger, width: 1.5),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: ColorTokens.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: ColorTokens.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(20)),
          side: BorderSide(color: ColorTokens.borderSubtle, width: 1),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ColorTokens.inkPrimary,
        contentTextStyle: TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w500),
        shape: RoundedRectangleBorder(borderRadius: borderRadius12),
      ),
    );
  }
}

