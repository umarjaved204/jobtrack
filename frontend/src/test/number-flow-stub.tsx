import type { NumberFlowProps } from '@number-flow/react';
import type { ReactNode } from 'react';

/*
 * jsdom can't run NumberFlow (its custom element never upgrades: "willUpdate is not a
 * function"), so tests swap in this stand-in (see setup.ts). It renders the formatted
 * value and exposes `animated` as data-animated, so tests can check *when* a counter
 * animates. The real animation is checked in a browser.
 */
function NumberFlow({ value, format, locales, animated = true, ...rest }: NumberFlowProps) {
  const ariaHidden = rest['aria-hidden'];
  return (
    <span data-number-flow="" data-animated={String(animated)} aria-hidden={ariaHidden}>
      {new Intl.NumberFormat(locales, format).format(Number(value))}
    </span>
  );
}

function NumberFlowGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export { NumberFlowGroup };
export default NumberFlow;
