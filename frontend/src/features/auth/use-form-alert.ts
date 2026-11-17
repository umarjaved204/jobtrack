import { useState } from 'react';

import { formatWait, useCountdown } from '@/hooks/use-countdown';

import type { ServerErrorOutcome } from './form-errors';

/**
 * The form-level message above a form, plus the 429 wait.
 * The message text is fixed when it appears (screen readers announce it once); the live
 * countdown belongs on the submit button. A rate-limit message disappears when the wait ends.
 */
export function useFormAlert() {
  const wait = useCountdown();
  const [alert, setAlert] = useState<{ text: string; untilWaitEnds: boolean } | null>(null);

  return {
    message: alert && (!alert.untilWaitEnds || wait.isRunning) ? alert.text : null,
    isWaiting: wait.isRunning,
    waitSeconds: wait.remaining,
    clear: () => setAlert(null),
    show: (text: string) => setAlert({ text, untilWaitEnds: false }),
    showOutcome({ message, retryAfterSeconds }: ServerErrorOutcome) {
      if (retryAfterSeconds !== null) {
        wait.start(retryAfterSeconds);
        setAlert({
          text: `${message ?? 'Too many attempts.'} Try again in ${formatWait(retryAfterSeconds)}.`,
          untilWaitEnds: true,
        });
      } else {
        setAlert(message ? { text: message, untilWaitEnds: false } : null);
      }
    },
  };
}
