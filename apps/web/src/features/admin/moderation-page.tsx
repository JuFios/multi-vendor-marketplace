import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { ReasonDialog } from '../../components/reason-dialog';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { queryKeys } from '../../lib/query-keys';

import {
  approveProduct,
  fetchModerationProducts,
  rejectProduct,
  type ApplicationStatus,
} from './admin-api';

const PAGE_SIZE = 10;
const STATUSES: readonly ApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export function ProductModerationPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<string | null>(null);

  const status = STATUSES.find((value) => value === params.get('status')) ?? 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const filters = { page, status };
  const products = useQuery({
    queryKey: queryKeys.adminProducts(filters),
    queryFn: () => fetchModerationProducts(filters),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
  const approve = useMutation({
    mutationFn: approveProduct,
    onSuccess: () => {
      toast.push('Product approved', 'ok');
      return refresh();
    },
    onError: (error) => {
      toast.push(errorMessage(error), 'error');
    },
  });
  const reject = useMutation({
    mutationFn: rejectProduct,
    onSuccess: () => {
      toast.push('Product rejected', 'ok');
      setRejecting(null);
      return refresh();
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Product moderation</h1>
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

      {products.isPending ? <Skeleton className="h-40" /> : null}
      {products.isError ? (
        <ErrorState message="Could not load products." onRetry={() => void products.refetch()} />
      ) : null}
      {products.data?.items.length === 0 ? <EmptyState title="Nothing to moderate" /> : null}
      {products.data !== undefined && products.data.items.length > 0 ? (
        <>
          <Table headers={['Product', 'Type', 'Price', 'Status', '']}>
            {products.data.items.map((product) => (
              <tr key={product.id} className="border-b border-line">
                <td className="px-3 py-2">
                  <Link to={`/products/${product.id}`} className="font-medium hover:underline">
                    {product.title}
                  </Link>
                  {product.moderationReason ? (
                    <p className="text-xs text-muted">{product.moderationReason}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {product.type === 'AUCTION' ? 'Auction' : 'Fixed price'}
                </td>
                <td className="px-3 py-2">
                  {product.priceCents !== null ? <Money cents={product.priceCents} /> : '—'}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={product.moderationStatus} />
                </td>
                <td className="space-x-2 whitespace-nowrap px-3 py-2">
                  {product.moderationStatus !== 'APPROVED' ? (
                    <Button
                      aria-label={`Approve ${product.title}`}
                      loading={approve.isPending && approve.variables === product.id}
                      onClick={() => {
                        approve.mutate(product.id);
                      }}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {product.moderationStatus !== 'REJECTED' ? (
                    <Button
                      variant="danger"
                      aria-label={`Reject ${product.title}`}
                      onClick={() => {
                        setRejecting(product.id);
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
            total={products.data.total}
            onPageChange={(next) => {
              setParams({ status, page: String(next) });
            }}
          />
        </>
      ) : null}

      <ReasonDialog
        open={rejecting !== null}
        title="Reject product"
        description="The seller sees this reason and the product leaves the catalog."
        confirmLabel="Reject product"
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
