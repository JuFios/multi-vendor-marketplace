import type { Meta, StoryObj } from '@storybook/react-vite';

import { StockIndicator } from './stock-indicator';

const meta = { title: 'Product/StockIndicator', component: StockIndicator } satisfies Meta<
  typeof StockIndicator
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plenty: Story = { args: { stock: 40 } };
export const LowStock: Story = { args: { stock: 3 } };
export const SoldOut: Story = { args: { stock: 0 } };
