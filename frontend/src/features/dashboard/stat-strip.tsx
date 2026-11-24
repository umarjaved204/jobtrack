import type * as React from 'react';
import { Link } from 'react-router';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AnalyticsSummary, Rate } from '@/types/analytics';

import { Counter } from './counter';

const PERCENT = { style: 'percent', maximumFractionDigits: 0 } as const;

/** "—" for a rate with nothing to divide by, read out as words. */
function NoRate() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">Not enough data</span>
    </>
  );
}

/*
 * Ledger cells: hairlines between columns, and between the two rows on phones (2 × 2).
 * Shared by the skeleton so the frame doesn't move when the figures land.
 */
const cellClass = cn(
  'grid content-start gap-1.5 border-border px-4 py-5 sm:px-6',
  'odd:border-r [&:nth-child(-n+2)]:border-b',
  'lg:border-r lg:[&:nth-child(-n+2)]:border-b-0 lg:last:border-r-0',
);

function Figure({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <div className={cellClass}>
      <dt className="kicker text-muted-foreground">{label}</dt>
      <dd className="display-face text-figure font-medium lining-nums tabular-nums">{children}</dd>
      <dd className="text-sm text-muted-foreground">{note}</dd>
    </div>
  );
}

function RateFigure({ rate, cause }: { rate: Rate; cause: string | null }) {
  return rate === null ? <NoRate /> : <Counter value={rate} cause={cause} format={PERCENT} />;
}

type StatStripProps = {
  summary: AnalyticsSummary;
  /** The range these figures belong to, or null while the previous range's are shown. */
  cause: string | null;
  rangeLabel: string;
};

/**
 * The dashboard's headline figures, set like a newspaper ledger: one strip between a heavy
 * and a hairline ink rule, not a grid of cards. Counts come with their denominators ("9 of 32"), so a rate is never
 * read without its sample size.
 */
function StatStrip({ summary: s, cause, rangeLabel }: StatStripProps) {
  return (
    <section aria-labelledby="key-figures-heading" className="grid gap-3">
      <h2 id="key-figures-heading" className="sr-only">
        Key figures, {rangeLabel.toLowerCase()}
      </h2>
      <dl className="grid grid-cols-2 border-t-[3px] border-b border-rule lg:grid-cols-4">
        <Figure label="Applied" note="Applications sent in this period">
          <Counter value={s.applied} cause={cause} />
        </Figure>
        <Figure label="Active" note="Still in progress, from applied to offer">
          <Counter value={s.active} cause={cause} />
        </Figure>
        <Figure
          label="Interview rate"
          note={
            s.applied > 0
              ? `${s.interviewed} of ${s.applied} reached an interview`
              : 'Nothing applied for in this period'
          }
        >
          <RateFigure rate={s.interview_rate} cause={cause} />
        </Figure>
        <Figure
          label="Offers"
          note={
            s.offer_rate === null ? (
              'Nothing applied for in this period'
            ) : (
              <>
                <Counter value={s.offer_rate} cause={cause} format={PERCENT} /> of applications
              </>
            )
          }
        >
          <Counter value={s.offers} cause={cause} />
        </Figure>
      </dl>
      <p className="text-sm text-muted-foreground">
        {s.wishlist === 0 ? (
          'Nothing on your wishlist.'
        ) : (
          <>
            Plus{' '}
            <strong className="font-semibold text-foreground">
              {s.wishlist} {s.wishlist === 1 ? 'role' : 'roles'} on your wishlist
            </strong>
            , not yet applied for (not limited to this period).{' '}
            <Link to="/applications?view=table&status=wishlist" className="link">
              See the wishlist
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

function StatStripSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading key figures"
      className="grid grid-cols-2 border-t-[3px] border-b border-rule lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={cellClass}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}

export { StatStrip, StatStripSkeleton };
