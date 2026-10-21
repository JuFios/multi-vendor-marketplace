import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Checkbox } from './checkbox';
import { Input } from './input';
import { PriceRangeInput } from './price-range-input';
import { Select } from './select';

const meta = { title: 'UI/Form controls' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  render: () => <Input label="Email" placeholder="you@example.com" />,
};
export const TextInputError: Story = {
  render: () => <Input label="Email" defaultValue="nope" error="Enter a valid email" />,
};
export const SelectField: Story = {
  render: () => (
    <Select label="Sort by" defaultValue="relevance">
      <option value="relevance">Relevance</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
    </Select>
  ),
};
export const CheckboxField: Story = { render: () => <Checkbox label="In stock only" /> };
function PriceRangeDemo() {
  const [min, setMin] = useState('10');
  const [max, setMax] = useState('250');
  return <PriceRangeInput min={min} max={max} onMinChange={setMin} onMaxChange={setMax} />;
}

export const PriceRange: Story = { render: () => <PriceRangeDemo /> };
