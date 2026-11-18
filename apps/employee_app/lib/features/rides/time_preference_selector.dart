import 'package:etms_core/etms_core.dart';
import 'package:material_ui/material_ui.dart';

enum BookingTimePreference {
  pickupAt,
  arriveBy;

  String get apiValue =>
      this == BookingTimePreference.arriveBy ? 'ARRIVE_BY' : 'PICKUP_AT';

  static BookingTimePreference fromApi(String? raw) {
    return raw?.toUpperCase() == 'ARRIVE_BY'
        ? BookingTimePreference.arriveBy
        : BookingTimePreference.pickupAt;
  }
}

class TimePreferenceCopy {
  const TimePreferenceCopy({
    required this.segmentLabel,
    required this.headlinePrompt,
    required this.timeFieldLabel,
    required this.helperText,
    required this.icon,
    required this.semanticHint,
  });

  final String segmentLabel;
  final String headlinePrompt;
  final String timeFieldLabel;
  final String helperText;
  final IconData icon;
  final String semanticHint;

  static TimePreferenceCopy resolve({
    required String direction,
    required BookingTimePreference preference,
  }) {
    final isHomeToOffice = direction.toUpperCase() != 'LOGOUT';
    if (isHomeToOffice) {
      if (preference == BookingTimePreference.pickupAt) {
        return const TimePreferenceCopy(
          segmentLabel: 'Pickup Time',
          headlinePrompt: 'Pick me up from home around',
          timeFieldLabel: 'Pickup time from home',
          helperText: 'Cab arrives around this window; office arrival adapts to stops & traffic.',
          icon: Icons.home_outlined,
          semanticHint: 'Select to specify when the cab should pick you up from home.',
        );
      }
      return const TimePreferenceCopy(
        segmentLabel: 'Reach Office By',
        headlinePrompt: 'Get me to the office by',
        timeFieldLabel: 'Target arrival at office',
        helperText: 'Pickup time is planned backward automatically with travel + safety buffer.',
        icon: Icons.business_center_outlined,
        semanticHint: 'Select to specify what time you need to arrive at the office.',
      );
    }

    // Office -> Home (LOGOUT)
    if (preference == BookingTimePreference.pickupAt) {
      return const TimePreferenceCopy(
        segmentLabel: 'Pickup Time',
        headlinePrompt: 'Pick me up from the office around',
        timeFieldLabel: 'Pickup time from office',
        helperText: 'Cab departs campus around this window toward your home locality.',
        icon: Icons.business_outlined,
        semanticHint: 'Select to specify when the cab should pick you up from the office.',
      );
    }
    return const TimePreferenceCopy(
      segmentLabel: 'Reach Home By',
      headlinePrompt: 'Get me home by',
      timeFieldLabel: 'Target arrival at home',
      helperText: 'Departure is calculated earlier so you reach home before your deadline.',
      icon: Icons.home_work_outlined,
      semanticHint: 'Select to specify what time you need to arrive home.',
    );
  }
}

/// Custom animated accessible two-position sliding time preference selector.
/// Dynamically switches copy, icons, and accessibility hints for Home->Office vs Office->Home.
class TimePreferenceSelector extends StatelessWidget {
  const TimePreferenceSelector({
    super.key,
    required this.direction,
    required this.selected,
    required this.onChanged,
  });

  final String direction;
  final BookingTimePreference selected;
  final ValueChanged<BookingTimePreference> onChanged;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final animDuration = reduceMotion ? Duration.zero : HarborMotion.surfaceDuration;
    final pickupCopy = TimePreferenceCopy.resolve(
      direction: direction,
      preference: BookingTimePreference.pickupAt,
    );
    final arriveCopy = TimePreferenceCopy.resolve(
      direction: direction,
      preference: BookingTimePreference.arriveBy,
    );
    final activeCopy = selected == BookingTimePreference.pickupAt ? pickupCopy : arriveCopy;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          label: 'Schedule timing preference selector',
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: ColorTokens.surfaceMuted,
              borderRadius: const BorderRadius.all(Radius.circular(14)),
              border: Border.all(color: ColorTokens.borderSubtle),
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final segmentWidth = (constraints.maxWidth / 2).clamp(80.0, 600.0);
                final isRight = selected == BookingTimePreference.arriveBy;

                return Stack(
                  alignment: Alignment.centerLeft,
                  children: [
                    AnimatedPositioned(
                      duration: animDuration,
                      curve: HarborMotion.easeOutCurve,
                      left: isRight ? segmentWidth : 0,
                      top: 0,
                      bottom: 0,
                      width: segmentWidth,
                      child: Container(
                        decoration: BoxDecoration(
                          color: ColorTokens.surface,
                          borderRadius: const BorderRadius.all(Radius.circular(11)),
                          border: Border.all(color: ColorTokens.primaryBorder),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x140F2544),
                              blurRadius: 6,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: _SegmentButton(
                            key: const Key('time_pref_pickup_at'),
                            copy: pickupCopy,
                            isSelected: selected == BookingTimePreference.pickupAt,
                            onTap: () {
                              if (selected != BookingTimePreference.pickupAt) {
                                HarborMotion.hapticSelection();
                                onChanged(BookingTimePreference.pickupAt);
                              }
                            },
                          ),
                        ),
                        Expanded(
                          child: _SegmentButton(
                            key: const Key('time_pref_arrive_by'),
                            copy: arriveCopy,
                            isSelected: selected == BookingTimePreference.arriveBy,
                            onTap: () {
                              if (selected != BookingTimePreference.arriveBy) {
                                HarborMotion.hapticSelection();
                                onChanged(BookingTimePreference.arriveBy);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        AnimatedSwitcher(
          duration: animDuration,
          switchInCurve: HarborMotion.easeOutCurve,
          child: Container(
            key: ValueKey('${direction}_${selected.apiValue}'),
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ColorTokens.primarySoft,
              borderRadius: const BorderRadius.all(Radius.circular(12)),
              border: Border.all(color: ColorTokens.primaryBorder),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(activeCopy.icon, size: 18, color: ColorTokens.primaryPressed),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        activeCopy.headlinePrompt,
                        style: TypographyTokens.label.copyWith(
                          color: ColorTokens.inkPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        activeCopy.helperText,
                        style: TypographyTokens.bodyMuted.copyWith(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
    super.key,
    required this.copy,
    required this.isSelected,
    required this.onTap,
  });

  final TimePreferenceCopy copy;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = isSelected ? ColorTokens.primaryPressed : ColorTokens.inkSecondary;

    return Semantics(
      button: true,
      selected: isSelected,
      label: copy.segmentLabel,
      hint: copy.semanticHint,
      child: InkWell(
        borderRadius: const BorderRadius.all(Radius.circular(11)),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(copy.icon, size: 17, color: fg),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    copy.segmentLabel,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TypographyTokens.label.copyWith(
                      fontSize: 12.5,
                      color: fg,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
