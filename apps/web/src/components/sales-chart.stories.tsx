import type { Meta, StoryObj } from '@storybook/react-vite';

import { chartDays, salesChart } from '../test/analytics-fixtures';

import { SalesChart } from './sales-chart';

const meta = {
  title: 'Dashboard/SalesChart',
  component: SalesChart,
  args: { data: salesChart, size: { width: 720, height: 320 } },
} satisfies Meta<typeof SalesChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GrossSales: Story = {};
export const Orders: Story = { args: { metric: 'ordersCount' } };
export const PlatformRevenue: Story = { args: { metric: 'commissionCents' } };
export const NoPreviousPeriod: Story = {
  args: { data: { current: chartDays(1, 1000), previous: [] } },
};
