import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Input } from '../../components/input';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Textarea } from '../../components/textarea';
import { fetchMyApplication, submitApplication } from '../../features/auth/api/auth-api';
import { applicationSchema, type ApplicationValues } from '../../features/auth/auth-schemas';
import { refreshSession } from '../../lib/api/api';
import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { queryKeys } from '../../lib/query-keys';

export function SellerApplicationPage() {
  const queryClient = useQueryClient();
  const application = useQuery({
    queryKey: queryKeys.sellerApplication,
    queryFn: async () => {
      try {
        return await fetchMyApplication();
      } catch (error) {
        if (isApiError(error) && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });
  const form = useForm<ApplicationValues>({ resolver: zodResolver(applicationSchema) });
  const submit = useMutation({
    mutationFn: submitApplication,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sellerApplication }),
  });
  // An approval adds the SELLER role, which only a fresh access token carries.
  const syncRoles = useMutation({ mutationFn: refreshSession });

  if (application.isPending) {
    return <Skeleton className="mx-auto h-48 max-w-lg" />;
  }
  if (application.isError) {
    return (
      <ErrorState
        message="Could not load your application."
        onRetry={() => void application.refetch()}
      />
    );
  }

  const current = application.data;
  const canApply = current === null || current.status === 'REJECTED';

  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Become a seller</h1>
      {current !== null ? (
        <div className="mb-4 space-y-1 text-sm">
          <p>
            Store <strong>{current.storeName}</strong> <StatusBadge status={current.status} />
          </p>
          {current.status === 'REJECTED' && current.rejectionReason ? (
            <p className="text-danger">Reason: {current.rejectionReason}</p>
          ) : null}
          {current.status === 'PENDING' ? (
            <p className="text-muted">Your application is waiting for a moderator.</p>
          ) : null}
          {current.status === 'APPROVED' ? (
            <div className="flex items-center gap-3">
              <p className="text-ok">Approved.</p>
              <Button
                variant="secondary"
                loading={syncRoles.isPending}
                onClick={() => syncRoles.mutate()}
              >
                Activate seller access
              </Button>
              <Link to="/seller" className="text-brand">
                Open seller area
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {canApply ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              submit.mutate(values);
            })(event);
          }}
        >
          <Input
            label="Store name"
            error={form.formState.errors.storeName?.message}
            {...form.register('storeName')}
          />
          <Textarea
            id="description"
            label="Description"
            error={form.formState.errors.description?.message}
            rows={4}
            {...form.register('description')}
          />
          {submit.isError ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(submit.error)}
            </p>
          ) : null}
          <Button type="submit" loading={submit.isPending}>
            {current === null ? 'Submit application' : 'Apply again'}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
