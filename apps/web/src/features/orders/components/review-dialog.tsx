import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../../../components/button';
import { Modal } from '../../../components/modal';
import { Select } from '../../../components/select';
import { useToast } from '../../../components/toast-context';
import { errorMessage } from '../../../lib/api/error-message';
import { queryKeys } from '../../../lib/query-keys';
import { createReview, fetchReviewEligibility } from '../../product/product-api';

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(1, 'Write a few words').max(2000),
});
type ReviewValues = z.input<typeof reviewSchema>;

interface ReviewDialogProps {
  product: { id: string; title: string } | null;
  onClose: () => void;
}

function ReviewForm({ productId, onClose }: { productId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<ReviewValues, unknown, z.output<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 5, text: '' },
  });
  const submit = useMutation({
    mutationFn: (values: z.output<typeof reviewSchema>) => createReview({ productId, ...values }),
    onSuccess: () => {
      toast.push('Thank you for your review', 'ok');
      void queryClient.invalidateQueries({ queryKey: queryKeys.product(productId) });
      void queryClient.invalidateQueries({ queryKey: ['product', productId, 'reviews'] });
      onClose();
    },
  });

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          submit.mutate(values);
        })(event);
      }}
    >
      <Select label="Rating" {...form.register('rating')}>
        {[5, 4, 3, 2, 1].map((value) => (
          <option key={value} value={value}>
            {'★'.repeat(value)} ({value})
          </option>
        ))}
      </Select>
      <label className="flex flex-col gap-1 text-sm" htmlFor="review-text">
        <span className="font-medium">Your review</span>
        <textarea
          id="review-text"
          rows={4}
          className="rounded-md border border-line px-3 py-2 outline-none ring-brand focus:ring-2"
          {...form.register('text')}
        />
        {form.formState.errors.text?.message !== undefined ? (
          <span className="text-danger">{form.formState.errors.text.message}</span>
        ) : null}
      </label>
      {submit.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(submit.error)}
        </p>
      ) : null}
      <Button type="submit" loading={submit.isPending}>
        Publish review
      </Button>
    </form>
  );
}

function ReviewGate({ productId, onClose }: { productId: string; onClose: () => void }) {
  const eligibility = useQuery({
    queryKey: queryKeys.reviewEligibility(productId),
    queryFn: () => fetchReviewEligibility(productId),
  });
  if (eligibility.isPending) {
    return <p className="text-sm text-muted">Checking…</p>;
  }
  if (eligibility.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Could not check whether you can review this product.
      </p>
    );
  }
  if (!eligibility.data.eligible) {
    return (
      <p className="text-sm">
        {eligibility.data.reason === 'ALREADY_REVIEWED'
          ? 'You have already reviewed this product.'
          : 'Only buyers who received this product can review it.'}
      </p>
    );
  }
  return <ReviewForm productId={productId} onClose={onClose} />;
}

export function ReviewDialog({ product, onClose }: ReviewDialogProps) {
  return (
    <Modal open={product !== null} title={`Review: ${product?.title ?? ''}`} onClose={onClose}>
      {product !== null ? <ReviewGate productId={product.id} onClose={onClose} /> : null}
    </Modal>
  );
}
