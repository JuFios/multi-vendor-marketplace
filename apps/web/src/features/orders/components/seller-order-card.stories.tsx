import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';

import { sellerOrder } from '../../../test/fixtures';

import { SellerOrderCard } from './seller-order-card';

const base = sellerOrder() as never;

const meta = {
  title: 'Orders/SellerOrderCard',
  component: SellerOrderCard,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-2xl">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    sellerOrder: base,
    onCancel: () => undefined,
    onConfirmReceipt: () => undefined,
    onReview: () => undefined,
    onOpenDispute: () => undefined,
  },
} satisfies Meta<typeof SellerOrderCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};
export const Processing: Story = {
  args: { sellerOrder: sellerOrder({ status: 'PROCESSING' }) as never },
};
export const Shipped: Story = {
  args: { sellerOrder: sellerOrder({ status: 'SHIPPED' }) as never },
};
export const Completed: Story = {
  args: { sellerOrder: sellerOrder({ status: 'COMPLETED' }) as never },
};
export const Cancelled: Story = {
  args: { sellerOrder: sellerOrder({ status: 'CANCELLED' }) as never },
};
export const PartiallyRefunded: Story = {
  args: {
    sellerOrder: sellerOrder({
      status: 'COMPLETED',
      refundedCents: 1000,
      items: [
        {
          id: 'i1',
          productId: 'p1',
          title: 'Keyboard',
          unitPriceCents: 1000,
          quantity: 2,
          refundedQuantity: 1,
          lineTotalCents: 2000,
        },
      ],
    }) as never,
  },
};
export const WithDispute: Story = {
  args: {
    sellerOrder: sellerOrder({ status: 'SHIPPED' }) as never,
    dispute: { id: 'd1', status: 'UNDER_REVIEW' },
  },
};
export const PaymentFailed: Story = {
  args: { sellerOrder: sellerOrder({ status: 'CANCELLED', paymentStatus: 'FAILED' }) as never },
};
