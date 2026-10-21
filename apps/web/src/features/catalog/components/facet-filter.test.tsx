import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FacetFilter } from './facet-filter';

const options = [
  { value: 'a', label: 'Alpha', count: 3 },
  { value: 'b', label: 'Beta', count: 1 },
];

describe('FacetFilter', () => {
  it('reports the chosen value and clears it when chosen again', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FacetFilter title="Group" options={options} selected="" onChange={onChange} />,
    );

    await userEvent.click(screen.getByLabelText(/Alpha/));
    expect(onChange).toHaveBeenLastCalledWith('a');

    rerender(<FacetFilter title="Group" options={options} selected="a" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText(/Alpha/));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
