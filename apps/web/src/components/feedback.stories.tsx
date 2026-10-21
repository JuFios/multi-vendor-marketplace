import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';
import { Toast } from './toast';

const meta = { title: 'UI/Feedback states' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => (
    <div className="space-y-2">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Spinner />
    </div>
  ),
};
export const Empty: Story = {
  render: () => <EmptyState title="No products found" detail="Try another search term." />,
};
export const Error: Story = {
  render: () => <ErrorState message="Could not load products." onRetry={() => undefined} />,
};
export const Toasts: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Toast tone="info" message="Order status updated" />
      <Toast tone="ok" message="Review published" />
      <Toast tone="error" message="Bid is too low" />
    </div>
  ),
};
