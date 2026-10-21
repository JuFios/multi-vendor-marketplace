import { api, unwrap } from '../../lib/api/api';

export function fetchNotifications(params: { page: number; limit: number; after?: string }) {
  return unwrap(api.GET('/api/notifications', { params: { query: params } }));
}

export function fetchUnreadCount() {
  return unwrap(api.GET('/api/notifications/unread-count'));
}

export function markRead(id: string) {
  return unwrap(api.POST('/api/notifications/{id}/read', { params: { path: { id } } }));
}

export function markAllRead() {
  return unwrap(api.POST('/api/notifications/read-all'));
}
