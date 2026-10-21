import type { Meta, StoryObj } from '@storybook/react-vite';

import { OrderStatusBadge } from './status-badge';

const meta = { title: 'Orders/OrderStatusBadge', component: OrderStatusBadge } satisfies Meta<
  typeof OrderStatusBadge
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = { args: { status: 'NEW' } };
export const PartiallyShipped: Story = { args: { status: 'PARTIALLY_SHIPPED' } };
export const Completed: Story = { args: { status: 'COMPLETED' } };
export const CompletedWithCancelledPart: Story = {
  args: { status: 'COMPLETED', hasCancelledParts: true },
};
export const Cancelled: Story = { args: { status: 'CANCELLED' } };
