import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Modal } from '../../components/modal';
import { Money } from '../../components/money';
import { Pagination } from '../../components/pagination';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Table } from '../../components/table';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { queryKeys } from '../../lib/query-keys';

import {
  archiveProduct,
  fetchSellerProducts,
  type SellerProduct,
  type SellerProductFilters,
} from './seller-api';

const PAGE_SIZE = 10;

function archiveFailure(error: unknown): string {
  if (isApiError(error) && error.code === 'PRODUCT_HAS_ACTIVE_AUCTION') {
    return 'This lot has bids or a winner who has not checked out yet, so it cannot be archived now.';
  }
  return errorMessage(error);
}

export function SellerProductsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [archiving, setArchiving] = useState<SellerProduct | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const type = params.get('type');
  const moderation = params.get('moderationStatus');
  const filters: SellerProductFilters = {
    page: Math.max(1, Number(params.get('page')) || 1),
    ...(type === 'FIXED_PRICE' || type === 'AUCTION' ? { type } : {}),
    ...(moderation === 'PENDING' || moderation === 'APPROVED' || moderation === 'REJECTED'
      ? { moderationStatus: moderation }
      : {}),
  };
  const products = useQuery({
    queryKey: queryKeys.sellerProducts(filters),
    queryFn: () => fetchSellerProducts(filters),
  });

  const setFilter = (key: string, value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      next.delete('page');
      return next;
    });
  };

  const archive = useMutation({
    mutationFn: (product: SellerProduct) => archiveProduct(product.id),
    onSuccess: () => {
      toast.push('Product archived', 'ok');
      setArchiving(null);
      setArchiveError(null);
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
    },
    onError: (error) => {
      setArchiveError(archiveFailure(error));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link to="/seller/products/new">
          <Button>New product</Button>
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select
          label="Type"
          value={type ?? ''}
          onChange={(event) => {
            setFilter('type', event.target.value);
          }}
        >
          <option value="">All</option>
          <option value="FIXED_PRICE">Fixed price</option>
          <option value="AUCTION">Auction</option>
        </Select>
        <Select
          label="Moderation"
          value={moderation ?? ''}
          onChange={(event) => {
            setFilter('moderationStatus', event.target.value);
          }}
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </div>

      {products.isPending ? <Skeleton className="h-48" /> : null}
      {products.isError ? (
        <ErrorState message="Could not load products." onRetry={() => void products.refetch()} />
      ) : null}
      {products.data?.items.length === 0 ? (
        <EmptyState
          title="No products found"
          detail="Create your first product to start selling."
        />
      ) : null}
      {products.data !== undefined && products.data.items.length > 0 ? (
        <>
          <Table headers={['Title', 'Type', 'Price', 'Stock', 'Moderation', '']}>
            {products.data.items.map((product) => (
              <tr key={product.id} className="border-b border-line">
                <td className="px-3 py-2">
                  <Link
                    to={`/seller/products/${product.id}`}
                    className="font-medium hover:underline"
                  >
                    {product.title}
                  </Link>
                  {product.moderationStatus === 'REJECTED' && product.moderationReason ? (
                    <p className="text-xs text-danger">Rejected: {product.moderationReason}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {product.type === 'AUCTION' ? 'Auction' : 'Fixed price'}
                </td>
                <td className="px-3 py-2">
                  {product.priceCents !== null ? <Money cents={product.priceCents} /> : '—'}
                </td>
                <td className="px-3 py-2">{product.type === 'AUCTION' ? '—' : product.stock}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={product.moderationStatus} />
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="ghost"
                    aria-label={`Archive ${product.title}`}
                    onClick={() => {
                      setArchiveError(null);
                      setArchiving(product);
                    }}
                  >
                    Archive
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={filters.page}
            limit={PAGE_SIZE}
            total={products.data.total}
            onPageChange={(page) => {
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('page', String(page));
                return next;
              });
            }}
          />
        </>
      ) : null}

      <Modal
        open={archiving !== null}
        title="Archive this product?"
        onClose={() => {
          setArchiving(null);
        }}
      >
        <p className="mb-3 text-sm">
          <strong>{archiving?.title}</strong> will disappear from the catalog. Items already in
          carts become unavailable.
        </p>
        {archiveError !== null ? (
          <p role="alert" className="mb-3 text-sm text-danger">
            {archiveError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setArchiving(null);
            }}
          >
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={archive.isPending}
            onClick={() => {
              if (archiving !== null) {
                archive.mutate(archiving);
              }
            }}
          >
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}
