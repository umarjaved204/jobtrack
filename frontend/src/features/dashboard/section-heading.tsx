import type * as React from 'react';
import { Link } from 'react-router';

/**
 * A dashboard section's head: a 28px Fraunces title over an ink rule, an optional link at
 * the right of the rule, then the standfirst. Inside a <figure>, put it in the figcaption.
 */
function SectionHeading({
  id,
  title,
  link,
  children,
}: {
  id: string;
  title: string;
  link?: { to: string; label: string };
  /** The standfirst: one or two sentences in secondary text. */
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2.5">
        <h2 id={id} className="font-display text-section font-semibold">
          {title}
        </h2>
        {link && (
          <Link to={link.to} className="shrink-0 text-sm link">
            {link.label}
          </Link>
        )}
      </div>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export { SectionHeading };
