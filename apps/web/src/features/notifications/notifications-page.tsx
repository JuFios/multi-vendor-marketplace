import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '../../components/button';
import { cn } from '../../components/cn';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Pagination } from '../../components/pagination';
import { Skeleton } from '../../components/skeleton';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { describeNotification } from './describe-notification';
import { fetchNotifications, markAllRead, markRead } from './notifications-api';

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const params = { page, limit: PAGE_SIZE };
  const notifications = useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: () => fetchNotifications(params),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const read = useMutation({ mutationFn: markRead, onSuccess: refresh });
  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: refresh });

  if (notifications.isPending) {
    return <Skeleton className="h-48" />;
  }
  if (notifications.isError) {
    return (
      <ErrorState
        message="Could not load notifications."
        onRetry={() => void notifications.refetch()}
      />
    );
  }
  if (notifications.data.total === 0) {
    return <EmptyState title="No notifications" detail="Updates about your orders show up here." />;
  }
  const hasUnread = notifications.data.items.some((item) => item.readAt === null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button
          variant="secondary"
          disabled={!hasUnread}
          loading={readAll.isPending}
          onClick={() => {
            readAll.mutate();
          }}
        >
          Mark all as read
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {notifications.data.items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-center justify-between gap-3 p-3 text-sm',
              item.readAt === null && 'bg-blue-50',
            )}
          >
            <span className={cn(item.readAt === null && 'font-semibold')}>
              {describeNotification(item.type)}
              <span className="ml-2 text-xs font-normal text-muted">
                {formatDateTime(item.createdAt)}
              </span>
            </span>
            {item.readAt === null ? (
              <Button
                variant="ghost"
                onClick={() => {
                  read.mutate(item.id);
                }}
              >
                Mark as read
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        limit={PAGE_SIZE}
        total={notifications.data.total}
        onPageChange={setPage}
      />
    </div>
  );
}
