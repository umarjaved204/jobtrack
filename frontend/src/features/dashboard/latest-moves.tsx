import { format } from 'date-fns/format';
import { Link } from 'react-router';

import { StatusBadge } from '@/components/status-badge';
import type { AnalyticsMoves } from '@/types/analytics';
import { statusLabels } from '@/types/application';

import { SectionHeading } from './section-heading';

/**
 * The latest status changes across every application, newest first: a ledger, so a
 * table (date, application, where it moved). Three columns fit a phone without
 * scrolling: company and role share one cell. Column headers borrow the kicker style.
 */
function LatestMoves({ moves }: { moves: AnalyticsMoves }) {
  const rows = moves.moves;
  return (
    <section aria-labelledby="latest-moves-heading" className="grid content-start gap-3">
      <SectionHeading
        id="latest-moves-heading"
        title="Latest moves"
        link={{ to: '/applications?view=table', label: 'All applications' }}
      />
      {rows.length === 0 ? (
        <p className="border border-dashed border-border-quiet px-4 py-6 text-sm text-muted-foreground">
          No moves yet. When an application changes status, on the board or its page, it shows up
          here.
        </p>
      ) : (
        <table className="w-full text-left text-[0.9375rem]">
          <caption className="sr-only">Latest status changes, newest first</caption>
          <thead>
            <tr className="kicker text-muted-foreground">
              <th scope="col" className="py-3 pr-3 font-semibold">
                Date
              </th>
              <th scope="col" className="p-3 font-semibold">
                Application
              </th>
              <th scope="col" className="py-3 pl-3 font-semibold">
                Moved to
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((move) => (
              <tr key={`${move.application_id}-${move.moved_at}`} className="border-t">
                <td className="py-3 pr-3 align-top whitespace-nowrap">
                  <time
                    dateTime={move.moved_at}
                    className="figures text-[0.8125rem] text-muted-foreground"
                  >
                    {format(new Date(move.moved_at), 'd MMM')}
                  </time>
                </td>
                <td className="min-w-0 p-3 align-top">
                  <Link
                    to={`/applications/${move.application_id}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {move.company}
                  </Link>
                  <span className="block text-sm text-muted-foreground">{move.role_title}</span>
                </td>
                <td className="py-3 pl-3 align-top">
                  <StatusBadge status={move.to_status} />
                  <span className="mt-1 block text-[0.8125rem] whitespace-nowrap text-muted-foreground sm:mt-0 sm:ml-2 sm:inline">
                    from {statusLabels[move.from_status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export { LatestMoves };
