import type { Meta, StoryObj } from '@storybook/react-vite';

import { KpiCard } from './kpi-card';
import { Money } from './money';

const meta = { title: 'Dashboard/KpiCard', component: KpiCard } satisfies Meta<typeof KpiCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Revenue: Story = { args: { label: 'Gross sales', value: <Money cents={1250000} /> } };
export const WithHint: Story = {
  args: { label: 'Orders', value: '184', hint: 'Not cancelled, last 30 days' },
};
export const Positive: Story = {
  args: { label: 'Net revenue', value: <Money cents={980000} />, tone: 'positive' },
};
export const Negative: Story = {
  args: { label: 'Refunds', value: <Money cents={45000} />, tone: 'negative' },
};
