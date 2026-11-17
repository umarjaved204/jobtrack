import { useId } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import type { ApplicationStatus } from '@/types/application';

const totals = [
  { value: 12, label: 'applied' },
  { value: 3, label: 'interviews' },
  { value: 1, label: 'offer' },
];

const roles: { company: string; role: string; status: ApplicationStatus }[] = [
  { company: 'Monzo', role: 'Senior Frontend Engineer', status: 'offer' },
  { company: 'Octopus Energy', role: 'Product Engineer', status: 'interview' },
  { company: 'Wise', role: 'Frontend Engineer, Payments', status: 'screening' },
  { company: 'GOV.UK', role: 'Senior Developer', status: 'applied' },
  { company: 'Figma', role: 'Design Systems Engineer', status: 'rejected' },
];

/**
 * An example week, set like a newspaper column: the week's totals as large figures,
 * then the roles behind them. Example data, labelled as such.
 */
function SampleWeek({ className }: { className?: string }) {
  const captionId = useId();
  return (
    // aria-labelledby: figcaption naming isn't computed consistently by assistive tech.
    <figure aria-labelledby={captionId} className={cn('border-t-4 border-rule pt-4', className)}>
      <figcaption id={captionId} className="font-display text-lg italic">
        A sample week in JobTrack
      </figcaption>

      <dl className="mt-6 grid grid-cols-3 border-y border-rule">
        {totals.map(({ value, label }, i) => (
          <div key={label} className={cn('py-4', i > 0 && 'border-l border-border pl-4')}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 figures text-6xl leading-none tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="divide-y divide-border">
        {roles.map(({ company, role, status }) => (
          <li key={company} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{company}</p>
              <p className="truncate text-sm text-muted-foreground">{role}</p>
            </div>
            <StatusBadge status={status} />
          </li>
        ))}
      </ul>
    </figure>
  );
}

export { SampleWeek };
