import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../../../components/button';
import { Modal } from '../../../components/modal';
import { Textarea } from '../../../components/textarea';
import { errorMessage } from '../../../lib/api/error-message';
import { openDispute, type Dispute } from '../../disputes/disputes-api';

const disputeSchema = z.object({
  reason: z.string().trim().min(1, 'Describe the problem').max(2000),
});
type DisputeValues = z.infer<typeof disputeSchema>;

interface DisputeDialogProps {
  sellerOrderId: string | null;
  onClose: () => void;
  onOpened: (dispute: Dispute) => void;
}

function DisputeForm({
  sellerOrderId,
  onOpened,
}: {
  sellerOrderId: string;
  onOpened: (dispute: Dispute) => void;
}) {
  const form = useForm<DisputeValues>({ resolver: zodResolver(disputeSchema) });
  const open = useMutation({
    mutationFn: (values: DisputeValues) => openDispute({ sellerOrderId, reason: values.reason }),
    onSuccess: onOpened,
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          open.mutate(values);
        })(event);
      }}
    >
      <Textarea
        id="dispute-reason"
        label="What went wrong?"
        error={form.formState.errors.reason?.message}
        rows={4}
        {...form.register('reason')}
      />
      {open.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(open.error)}
        </p>
      ) : null}
      <Button type="submit" loading={open.isPending}>
        Open dispute
      </Button>
    </form>
  );
}

export function DisputeDialog({ sellerOrderId, onClose, onOpened }: DisputeDialogProps) {
  return (
    <Modal open={sellerOrderId !== null} title="Open a dispute" onClose={onClose}>
      {sellerOrderId !== null ? (
        <DisputeForm sellerOrderId={sellerOrderId} onOpened={onOpened} />
      ) : null}
    </Modal>
  );
}
