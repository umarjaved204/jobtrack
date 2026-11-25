import type * as React from 'react';

/**
 * A region that is loading: skeletons (decorative, hidden from assistive tech) plus a
 * visually hidden label that screen readers do read. An `aria-label` on a plain div would
 * be ignored (ARIA doesn't name generic elements), hence the text.
 */
function Loading({
  label,
  className,
  children,
}: {
  /** "Loading the calendar". */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export { Loading };
