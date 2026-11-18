import 'package:etms_core/etms_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/state/employee_providers.dart';
import '../../core/utils/formatters.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifsAsync = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Trip Alerts'),
            if (unread > 0)
              Text(
                '$unread unread',
                style: TypographyTokens.label.copyWith(color: ColorTokens.primary),
              ),
          ],
        ),
        actions: [
          if (ref.watch(unreadNotificationsCountProvider) > 0)
            TextButton.icon(
              onPressed: () async {
                try {
                  await ref.read(notificationsProvider.notifier).markAllRead();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('All notifications marked read.')),
                    );
                  }
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(e.toString())),
                    );
                  }
                }
              },
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: const Text('Mark all read'),
            ),
          IconButton(
            tooltip: 'Refresh notifications',
            onPressed: () => ref.invalidate(notificationsProvider),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(notificationsProvider);
          await ref.read(notificationsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: notifsAsync.when(
                  loading: () => const LoadingState(cardCount: 4),
                  error: (err, _) => ErrorState(
                    title: 'Could not load notifications',
                    message: err.toString(),
                    onRetry: () => ref.invalidate(notificationsProvider),
                  ),
                  data: (items) {
                    if (items.isEmpty) {
                      return const EmptyState(
                        icon: Icons.notifications_none_rounded,
                        title: 'All caught up',
                        message:
                            'Trip dispatches, pickup arrival notices, and roster modifications appear here.',
                      );
                    }
                    return Column(
                      children: [
                        for (var i = 0; i < items.length; i++) ...[
                          NotificationTile(
                            title: items[i].title,
                            body: items[i].body,
                            category: items[i].category,
                            timestampLabel: SolFormatters.relativeTime(items[i].createdAt),
                            isRead: items[i].isRead,
                            onTap: () {
                              if (!items[i].isRead) {
                                ref
                                    .read(notificationsProvider.notifier)
                                    .markRead(items[i].id);
                              }
                            },
                          ),
                          if (i < items.length - 1) const SizedBox(height: 10),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

