import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

abstract final class SolFormatters {
  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  static const _weekdays = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ];

  static String isoDate(DateTime dt) {
    final y = dt.year.toString().padLeft(4, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final d = dt.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  static String readableDate(DateTime dt) {
    final wd = _weekdays[dt.weekday - 1];
    final mo = _months[dt.month - 1];
    return '$wd, ${dt.day} $mo ${dt.year}';
  }

  static String readableIsoDate(String raw) {
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return raw;
    return readableDate(parsed);
  }

  static String timeHm(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String relativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds.abs() < 60) return 'Just now';
    if (diff.inMinutes.abs() < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours.abs() < 24) return '${diff.inHours}h ago';
    return '${dt.day} ${_months[dt.month - 1]}, ${timeHm(dt)}';
  }
}

Future<void> launchPhoneDialer(BuildContext context, String phone) async {
  final sanitized = phone.trim().replaceAll(' ', '');
  final uri = Uri(scheme: 'tel', path: sanitized);
  try {
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Dial $sanitized directly on your device.')),
      );
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Phone number: $sanitized')),
      );
    }
  }
}

Future<void> launchExternalMaps(
  BuildContext context,
  double latitude,
  double longitude,
) async {
  final uri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=$latitude,$longitude',
  );
  try {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No external maps app available on this device.')),
      );
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Coordinates: $latitude, $longitude')),
      );
    }
  }
}

