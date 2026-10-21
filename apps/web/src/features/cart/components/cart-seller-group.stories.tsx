import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';

import { CartSellerGroup } from './cart-seller-group';

const group = {
  seller: { id: 's1', name: 'KeyShop' },
  subtotalCents: 15000,
  items: [
    {
      productId: 'p1',
      title: 'Mechanical keyboard',
      unitPriceCents: 12000,
      quantity: 1,
      stock: 5,
      availability: 'AVAILABLE' as const,
      lineTotalCents: 12000,
    },
    {
      productId: 'p2',
      title: 'Keycap set',
      unitPriceCents: 1500,
      quantity: 2,
      stock: 8,
      availability: 'AVAILABLE' as const,
      lineTotalCents: 3000,
    },
  ],
};

const meta = {
  title: 'Cart/CartSellerGroup',
  component: CartSellerGroup,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-2xl">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: { group },
} satisfies Meta<typeof CartSellerGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ReadOnly: Story = { args: { readOnly: true } };
export const AvailabilityWarnings: Story = {
  args: {
    group: {
      ...group,
      items: [
        { ...group.items[0]!, availability: 'INSUFFICIENT_STOCK', stock: 0 },
        { ...group.items[1]!, availability: 'UNAVAILABLE' },
      ],
    },
  },
};
export const RefusedAtCheckout: Story = {
  args: {
    readOnly: true,
    problems: new Map([['p2', 'UNAVAILABLE' as const]]),
  },
};
