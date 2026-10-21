import { useEffect, useState } from 'react';

export function remainingMs(endsAt: string, serverTime: string, now = Date.now()): number {
  const offset = Date.parse(serverTime) - now;
  return Date.parse(endsAt) - (now + offset);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return '00:00:00';
  }
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function useCountdown(endsAt: string | undefined, serverTime: string | undefined): string {
  const [label, setLabel] = useState('00:00:00');

  useEffect(() => {
    if (endsAt === undefined || serverTime === undefined) {
      return;
    }
    const tick = () => {
      setLabel(formatCountdown(remainingMs(endsAt, serverTime)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [endsAt, serverTime]);

  return label;
}
