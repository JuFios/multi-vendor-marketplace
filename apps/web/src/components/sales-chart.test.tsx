import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { salesChart } from '../test/analytics-fixtures';

import { SalesChart } from './sales-chart';

describe('SalesChart', () => {
  it('draws the current period solid and the previous one dashed', () => {
    const { container } = render(
      <SalesChart data={salesChart} size={{ width: 600, height: 300 }} />,
    );

    const lines = container.querySelectorAll('path.recharts-line-curve');
    expect(lines).toHaveLength(2);
    const dashed = [...lines].filter((line) => line.getAttribute('stroke-dasharray') !== null);
    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.getAttribute('stroke')).toBe('#9ca3af');
  });

  it('names both series in the legend', () => {
    const { getByText } = render(
      <SalesChart data={salesChart} metric="ordersCount" size={{ width: 600, height: 300 }} />,
    );

    expect(getByText('Current period')).toBeInTheDocument();
    expect(getByText('Previous period')).toBeInTheDocument();
  });
});
