import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { SalesChart as SalesChartData } from '../features/admin/admin-api';
import {
  deltaPercent,
  formatDelta,
  mergeSeries,
  METRIC_LABELS,
  type ChartMetric,
  type ChartPoint,
} from '../features/admin/chart-model';
import { formatMoney } from '../lib/money';

interface SalesChartProps {
  data: Pick<SalesChartData, 'current' | 'previous'>;
  metric?: ChartMetric;
  /** Fixed pixel size; without it the chart fills its container. */
  size?: { width: number; height: number };
}

function formatValue(metric: ChartMetric, value: number | null): string {
  if (value === null) {
    return '—';
  }
  return metric === 'ordersCount' ? String(value) : formatMoney(value);
}

function ChartTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
  metric: ChartMetric;
}) {
  const point = payload?.[0]?.payload;
  if (active !== true || point === undefined) {
    return null;
  }
  return (
    <div className="rounded-md border border-line bg-white p-2 text-xs shadow">
      <p>
        <span className="font-medium">{point.currentDate ?? '—'}</span>:{' '}
        {formatValue(metric, point.current)}
      </p>
      <p className="text-muted">
        {point.previousDate ?? '—'}: {formatValue(metric, point.previous)}
      </p>
      <p>Change: {formatDelta(deltaPercent(point.current, point.previous))}</p>
    </div>
  );
}

export function SalesChart({ data, metric = 'grossCents', size }: SalesChartProps) {
  const points = mergeSeries(data.current, data.previous, metric);
  const chart = (
    <LineChart data={points} {...size} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="day" tickLine={false} />
      <YAxis
        width={72}
        tickFormatter={(value: number) => formatValue(metric, value)}
        tickLine={false}
      />
      <Tooltip content={<ChartTooltip metric={metric} />} />
      <Legend />
      <Line
        type="monotone"
        dataKey="current"
        name="Current period"
        stroke="#1d4ed8"
        strokeWidth={2}
        dot={false}
        connectNulls
        isAnimationActive={false}
      />
      <Line
        type="monotone"
        dataKey="previous"
        name="Previous period"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeDasharray="6 4"
        dot={false}
        connectNulls
        isAnimationActive={false}
      />
    </LineChart>
  );
  return (
    <figure aria-label={`${METRIC_LABELS[metric]}: current period against the previous one`}>
      {size === undefined ? (
        <ResponsiveContainer width="100%" height={320}>
          {chart}
        </ResponsiveContainer>
      ) : (
        chart
      )}
    </figure>
  );
}
