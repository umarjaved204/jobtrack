import NumberFlow, { type Format } from '@number-flow/react';
import { useEffect, useState } from 'react';

type CounterProps = {
  value: number;
  /**
   * What the value belongs to (the dashboard range), or null while the previous range's
   * figures are still on screen. The counter animates when this changes (and on first
   * load), but not when the same range's figures refresh in the background.
   */
  cause: string | null;
  format?: Format;
  className?: string;
};

type Shown = { value: number; cause: string | null; animated: boolean };

/**
 * An animated figure (NumberFlow): counts up on first load and rolls when the range
 * changes. Background refreshes swap the number without motion, and reduced-motion users
 * never see it move (NumberFlow's respectMotionPreference, on by default).
 *
 * The rolling digits are hidden from assistive tech; the formatted value is read instead.
 */
function Counter({ value, cause, format, className }: CounterProps) {
  // Starts at 0 and catches up after mount, so the first load has something to count from.
  const [shown, setShown] = useState<Shown>({ value: 0, cause: null, animated: false });

  useEffect(() => {
    if (cause === null) return; // previous range's figure: keep it as it is
    if (shown.cause === cause && shown.value === value) return;
    const animated = shown.cause !== cause; // first load or a new range
    // Next frame: the initial 0 must be painted before NumberFlow can animate from it.
    const frame = requestAnimationFrame(() => setShown({ value, cause, animated }));
    return () => cancelAnimationFrame(frame);
  }, [value, cause, shown]);

  const text = new Intl.NumberFormat('en-GB', format).format(value);
  return (
    <span className={className}>
      <NumberFlow
        value={shown.value}
        format={format}
        locales="en-GB"
        animated={shown.animated}
        aria-hidden="true"
      />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export { Counter };
