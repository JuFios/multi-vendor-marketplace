import type { ReactNode } from 'react';

import { Card } from './card';
import { cn } from './cn';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}

export function KpiCard({ label, value, hint, tone = 'default' }: KpiCardProps) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-ok',
          tone === 'negative' && 'text-danger',
        )}
      >
        {value}
      </p>
      {hint !== undefined ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}
