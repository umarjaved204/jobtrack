import type * as React from 'react';

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

function Figure({
  label,
  children,
  note,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  note: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="grid content-start gap-2 bg-background px-4 py-5 sm:px-5">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd
        className={cn(
          'figures text-display leading-none tracking-tight',
          accent && 'text-primary-text',
        )}
      >
        {children}
      </dd>
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
 * The dashboard's headline figures, set like a newspaper's market box: one ruled strip,
 * not a grid of cards. Counts come with their denominators ("9 of 32"), so a rate is never
 * read without its sample size.
 */
function StatStrip({ summary: s, cause, rangeLabel }: StatStripProps) {
  return (
    <section aria-labelledby="key-figures-heading" className="grid gap-3">
      <h2 id="key-figures-heading" className="sr-only">
        Key figures, {rangeLabel.toLowerCase()}
      </h2>
      <dl className="grid grid-cols-2 gap-px border-y-[3px] border-double border-rule bg-rule lg:grid-cols-4">
        <Figure label="Applied" note="Applications sent in this period">
          <Counter value={s.applied} cause={cause} />
        </Figure>
        <Figure label="Active" note="Still in progress, from applied to offer">
          <Counter value={s.active} cause={cause} />
        </Figure>
        <Figure
          label="Interview rate"
          accent
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
            Plus <span className="figures text-foreground">{s.wishlist}</span>{' '}
            {s.wishlist === 1 ? 'role' : 'roles'} on your wishlist, not yet applied for (not limited
            to this period).
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
      className="grid grid-cols-2 gap-px border-y-[3px] border-double border-rule bg-rule lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid gap-3 bg-background px-4 py-5 sm:px-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}

export { StatStrip, StatStripSkeleton };
