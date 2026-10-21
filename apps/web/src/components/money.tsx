import { formatMoney } from '../lib/money';

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums">{formatMoney(cents)}</span>;
}
