abstract final class DriverFormatters {
  static String timeHm(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String countdownMmSs(int totalSeconds) {
    final safe = totalSeconds < 0 ? 0 : totalSeconds;
    final mins = (safe ~/ 60).toString().padLeft(2, '0');
    final secs = (safe % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  static String delaySummary(int? delaySeconds) {
    if (delaySeconds == null) return 'Scheduled';
    if (delaySeconds == 0) return 'On time';
    final absMin = (delaySeconds.abs() / 60).round();
    if (delaySeconds < 0) return '${absMin}m early';
    return '+${absMin}m late';
  }

  static String noShowReasonLabel(String code) {
    return switch (code) {
      'PASSENGER_UNREACHABLE' => 'Passenger Unreachable',
      'DID_NOT_EXIT' => 'Did Not Exit Building',
      'CANCELLED_AT_DOOR' => 'Cancelled at Door',
      'WRONG_LOCATION' => 'Wrong Pickup Location',
      _ => 'Other Verified Reason',
    };
  }
}

