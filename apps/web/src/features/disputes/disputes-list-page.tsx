import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import { fetchDisputes } from './disputes-api';

export function DisputesListPage({ basePath }: { basePath: string }) {
  const disputes = useQuery({
    queryKey: queryKeys.disputes({ page: 1 }),
    queryFn: () => fetchDisputes(1),
  });

  if (disputes.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (disputes.isError) {
    return (
      <ErrorState message="Could not load disputes." onRetry={() => void disputes.refetch()} />
    );
  }
  if (disputes.data.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Disputes</h1>
        <EmptyState title="No disputes" detail="Disputes you open or receive appear here." />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Disputes</h1>
      <Table headers={['Opened', 'Reason', 'Status', '']}>
        {disputes.data.items.map((dispute) => (
          <tr key={dispute.id} className="border-b border-line">
            <td className="px-3 py-2">{formatDateTime(dispute.createdAt)}</td>
            <td className="max-w-xs truncate px-3 py-2">{dispute.reason}</td>
            <td className="px-3 py-2">
              <StatusBadge status={dispute.status} />
            </td>
            <td className="px-3 py-2">
              <Link to={`${basePath}/${dispute.id}`} className="text-brand">
                Open
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
