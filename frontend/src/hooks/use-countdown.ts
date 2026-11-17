import { useCallback, useEffect, useState } from 'react';

/**
 * Whole seconds left until a deadline, ticking once a second (for Retry-After waits).
 * Based on wall-clock time, so a backgrounded tab with throttled timers is still right.
 */
export function useCountdown() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const start = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    setRemaining(safeSeconds);
    setEndsAt(safeSeconds > 0 ? Date.now() + safeSeconds * 1000 : null);
  }, []);

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setEndsAt(null);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return { remaining, isRunning: remaining > 0, start };
}

/** "45 seconds", "1 second", "2 minutes" (rounded up): short and human. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
