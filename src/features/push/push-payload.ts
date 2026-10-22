import { destinationFor } from '@/features/notifications/notification-routes';

/**
 * Turns the `data` of a tapped push into a screen, using the same rules as the
 * notification centre. The server sends only identifiers (notification_id,
 * type and the record ids the stored notification carries); anything missing,
 * malformed or unknown leads to the notification centre instead of a guess.
 * Each destination screen re-reads the record for the signed-in member.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PushTarget = {
  notificationId: string | null;
  href: NonNullable<ReturnType<typeof destinationFor>>['href'] | '/notifications';
};

export function targetFor(data: unknown): PushTarget | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.source !== 'chr') return null;
  const id = typeof record.notification_id === 'string' && UUID_RE.test(record.notification_id) ? record.notification_id : null;
  const destination = destinationFor({
    id: id ?? '',
    type: typeof record.type === 'string' ? record.type : '',
    title: '',
    body: null,
    data: record,
    readAt: null,
    createdAt: '',
  });
  return { notificationId: id, href: destination?.href ?? '/notifications' };
}
