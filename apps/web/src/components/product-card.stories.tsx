import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';

import { ProductCard } from './product-card';

const meta = {
  title: 'Catalog/ProductCard',
  component: ProductCard,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="w-64">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    product: {
      id: 'p1',
      type: 'FIXED_PRICE',
      title: 'Mechanical keyboard with hot-swappable switches',
      priceCents: 12900,
      inStock: true,
      ratingAverage: 4.6,
      ratingCount: 18,
      sellerName: 'KeyShop',
    },
  },
} satisfies Meta<typeof ProductCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = {};
export const OutOfStock: Story = {
  args: { product: { ...meta.args.product, inStock: false } },
};
export const Unrated: Story = {
  args: { product: { ...meta.args.product, ratingAverage: 0, ratingCount: 0 } },
};
export const Auction: Story = {
  args: {
    product: { ...meta.args.product, type: 'AUCTION', auctionStatus: 'ACTIVE', priceCents: 4500 },
  },
};
export const AuctionNotSold: Story = {
  args: { product: { ...meta.args.product, type: 'AUCTION', auctionStatus: 'NOT_SOLD' } },
};
