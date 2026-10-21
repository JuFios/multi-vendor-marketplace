import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Skeleton } from '../../components/skeleton';
import { errorMessage } from '../../lib/api/error-message';
import { queryKeys } from '../../lib/query-keys';
import { useSessionUser } from '../auth/use-session';

import { DisputeThread } from './components/dispute-thread';
import { addDisputeMessage, fetchDispute } from './disputes-api';

/** A dispute conversation as seen by a participant (buyer or seller). */
export function DisputePage({ backTo }: { backTo: string }) {
  const { id = '' } = useParams();
  const user = useSessionUser();
  const queryClient = useQueryClient();
  const dispute = useQuery({ queryKey: queryKeys.dispute(id), queryFn: () => fetchDispute(id) });
  const send = useMutation({
    mutationFn: (text: string) => addDisputeMessage({ disputeId: id, text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.dispute(id) }),
  });

  if (dispute.isPending) {
    return <Skeleton className="h-64" />;
  }
  if (dispute.isError) {
    return (
      <ErrorState message="Could not load the dispute." onRetry={() => void dispute.refetch()} />
    );
  }
  return (
    <div className="space-y-3">
      <Link to={backTo} className="text-sm text-brand">
        ← Back
      </Link>
      <Card>
        <DisputeThread
          dispute={dispute.data}
          currentUserId={user?.id ?? ''}
          sending={send.isPending}
          error={send.isError ? errorMessage(send.error) : null}
          onSend={(text) => {
            send.mutate(text);
          }}
        />
      </Card>
    </div>
  );
}
