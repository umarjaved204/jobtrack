import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { todayDateOnly } from '@/lib/dates';

import { summaryQuery } from './api';
import { rangeLabels, useDashboardRange } from './range';
import { RangePicker } from './range-picker';
import { StatStrip, StatStripSkeleton } from './stat-strip';

function DashboardPage() {
  // The browser's calendar day (not the server's UTC date): see range.ts.
  const today = todayDateOnly();
  const { range, period, setRange } = useDashboardRange(today);
  const summary = useQuery(summaryQuery(period));

  let figures;
  if (summary.isError && !summary.data) {
    figures = (
      <Alert title="Your figures didn’t load">
        <p>{isApiError(summary.error) ? summary.error.detail : 'Something went wrong.'}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void summary.refetch()}>
          <RotateCcw /> Try again
        </Button>
      </Alert>
    );
  } else if (!summary.data) {
    figures = <StatStripSkeleton />;
  } else {
    figures = (
      <StatStrip
        summary={summary.data}
        // While the previous range's figures are shown, they keep their old cause.
        cause={summary.isPlaceholderData ? null : range}
        rangeLabel={rangeLabels[range]}
      />
    );
  }

  return (
    <>
      <PageHeader
        kicker="Overview"
        title="Dashboard"
        description="Your search at a glance: what you’ve applied for, how far it got, and where it came from."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      <div className="mt-8">{figures}</div>
    </>
  );
}

export { DashboardPage };
