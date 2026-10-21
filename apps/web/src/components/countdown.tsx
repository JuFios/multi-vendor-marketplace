import { useCountdown } from '../hooks/use-countdown';

export function Countdown({ endsAt, serverTime }: { endsAt: string; serverTime: string }) {
  const label = useCountdown(endsAt, serverTime);
  return (
    <span className="font-mono text-sm" aria-label="Time remaining">
      {label}
    </span>
  );
}
