import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Pagination } from '../../components/pagination';
import { ReasonDialog } from '../../components/reason-dialog';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';

import {
  approveApplication,
  fetchApplications,
  rejectApplication,
  type ApplicationStatus,
} from './admin-api';

const PAGE_SIZE = 10;
const STATUSES: readonly ApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<string | null>(null);

  const status = STATUSES.find((value) => value === params.get('status')) ?? 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, status };
  const applications = useQuery({
    queryKey: queryKeys.adminApplications(filters),
    queryFn: () => fetchApplications(filters),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'applications'] });
  const approve = useMutation({
    mutationFn: approveApplication,
    onSuccess: () => {
      toast.push('Seller approved', 'ok');
      return refresh();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
    },
  });
  const reject = useMutation({
    mutationFn: rejectApplication,
    onSuccess: () => {
      toast.push('Application rejected', 'ok');
      setRejecting(null);
      return refresh();
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Seller applications</h1>
      <Select
        label="Status"
        value={status}
        onChange={(event) => {
          setParams({ status: event.target.value });
        }}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </option>
        ))}
      </Select>

      {applications.isPending ? <Skeleton className="h-40" /> : null}
      {applications.isError ? (
        <ErrorState
          message="Could not load applications."
          onRetry={() => void applications.refetch()}
        />
      ) : null}
      {applications.data?.items.length === 0 ? <EmptyState title="No applications" /> : null}
      {applications.data !== undefined && applications.data.items.length > 0 ? (
        <>
          <Table headers={['Store', 'Description', 'Submitted', 'Status', '']}>
            {applications.data.items.map((application) => (
              <tr key={application.id} className="border-b border-line align-top">
                <td className="px-3 py-2 font-medium">{application.storeName}</td>
                <td className="max-w-sm px-3 py-2">{application.description}</td>
                <td className="px-3 py-2">{formatDateTime(application.createdAt)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={application.status} />
                  {application.rejectionReason ? (
                    <p className="text-xs text-muted">{application.rejectionReason}</p>
                  ) : null}
                </td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2">
                  {application.status !== 'APPROVED' ? (
                    <Button
                      aria-label={`Approve ${application.storeName}`}
                      loading={approve.isPending && approve.variables === application.id}
                      onClick={() => {
                        approve.mutate(application.id);
                      }}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {application.status === 'PENDING' ? (
                    <Button
                      variant="danger"
                      aria-label={`Reject ${application.storeName}`}
                      onClick={() => {
                        setRejecting(application.id);
                      }}
                    >
                      Reject
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={applications.data.total}
            onPageChange={(next) => {
              setParams({ status, page: String(next) });
            }}
          />
        </>
      ) : null}

      <ReasonDialog
        open={rejecting !== null}
        title="Reject application"
        description="The applicant sees this reason and can apply again."
        confirmLabel="Reject application"
        pending={reject.isPending}
        error={reject.isError ? errorMessage(reject.error) : null}
        onClose={() => {
          setRejecting(null);
        }}
        onConfirm={(reason) => {
          if (rejecting !== null) {
            reject.mutate({ id: rejecting, reason });
          }
        }}
      />
    </div>
  );
}
