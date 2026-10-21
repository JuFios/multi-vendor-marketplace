import type { Meta, StoryObj } from '@storybook/react-vite';

import { DisputeResolutionForm } from './dispute-resolution-form';

const sellerOrder = {
  status: 'SHIPPED' as const,
  items: [
    {
      id: 'i1',
      productId: 'p1',
      title: 'Mechanical keyboard',
      unitPriceCents: 12000,
      quantity: 2,
      refundedQuantity: 0,
      lineTotalCents: 24000,
    },
    {
      id: 'i2',
      productId: 'p2',
      title: 'Keycap set',
      unitPriceCents: 1500,
      quantity: 1,
      refundedQuantity: 1,
      lineTotalCents: 1500,
    },
  ],
};

const meta = {
  title: 'Admin/DisputeResolutionForm',
  component: DisputeResolutionForm,
  args: { sellerOrder, pending: false, onSubmit: () => undefined },
} satisfies Meta<typeof DisputeResolutionForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { pending: true } };
export const ServerError: Story = {
  args: { error: 'The refund exceeds what is left on the order.' },
};
