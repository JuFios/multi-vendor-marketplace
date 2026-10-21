import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const latest = useRef(callback);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    latest.current = callback;
  });
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (...args: Args) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        latest.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
