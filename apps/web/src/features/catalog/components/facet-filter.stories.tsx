import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { FacetFilter, type FacetOption } from './facet-filter';

const options: FacetOption[] = [
  { value: 'c1', label: 'Peripherals', count: 12 },
  { value: 'c2', label: 'Audio', count: 7 },
  { value: 'c3', label: 'Monitors', count: 0 },
];

const meta = { title: 'Catalog/FacetFilter', component: FacetFilter } satisfies Meta<
  typeof FacetFilter
>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <FacetFilter title="Category" options={options} selected={selected} onChange={setSelected} />
  );
}

export const Default: Story = {
  args: { title: 'Category', options, selected: '', onChange: () => undefined },
  render: () => <Interactive initial="" />,
};
export const WithSelection: Story = {
  args: { title: 'Category', options, selected: 'c2', onChange: () => undefined },
  render: () => <Interactive initial="c2" />,
};
export const Empty: Story = {
  args: { title: 'Seller', options: [], selected: '', onChange: () => undefined },
};
