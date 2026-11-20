import { format } from 'date-fns/format';
import { Check, RotateCcw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Match, SkillRequirement } from '@/types/match';

import { BAND_LABELS, percent, scoreBand } from './score-band';

type MatchResultProps = {
  match: Match;
  /** Shown on results scored with an older matcher (and wherever a re-run makes sense). */
  onRerun?: () => void;
  className?: string;
};

/**
 * A saved match, explained: the score and its two parts, the requirements covered and
 * missing, keywords to consider, and the lines that matched best.
 */
function MatchResult({ match, onRerun, className }: Readonly<MatchResultProps>) {
  const headingId = `match-${match.id}-score`;
  return (
    <article aria-labelledby={headingId} className={cn('grid gap-8', className)}>
      {!match.is_current && (
        <Alert tone="info" title="Scored with an older version of the matcher">
          <p>Scores from different versions aren’t comparable. Run it again for today’s score.</p>
          {onRerun && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRerun}>
              <RotateCcw /> Run again
            </Button>
          )}
        </Alert>
      )}

      <div className="grid gap-4 border-b pb-6 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-8">
        <div>
          <h2 id={headingId} className="kicker text-primary-text">
            Match score
          </h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="figures font-display text-7xl leading-none font-semibold">
              {match.score}
            </span>{' '}
            <span className="text-muted-foreground">out of 100</span>
          </p>
          <p className="mt-2 font-semibold">{BAND_LABELS[scoreBand(match.score)]}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:justify-self-end">
          <dt className="text-muted-foreground">Skills covered</dt>
          <dd className="text-right figures font-semibold">
            {match.skill_coverage === null ? '–' : percent(match.skill_coverage)}
          </dd>
          <dt className="text-muted-foreground">Wording match</dt>
          <dd className="text-right figures font-semibold">{percent(match.semantic_score)}</dd>
          <dt className="text-muted-foreground">Resume</dt>
          <dd className="text-right">{match.resume_label}</dd>
          {match.application_id && (
            <>
              <dt className="text-muted-foreground">Application</dt>
              <dd className="text-right">
                <Link
                  to={`/applications/${match.application_id}`}
                  className="underline underline-offset-2 hover:text-primary-text"
                >
                  {match.company} · {match.role_title}
                </Link>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Matched</dt>
          <dd className="text-right figures">
            <time dateTime={match.created_at}>
              {format(new Date(match.created_at), 'd MMM yyyy, HH:mm')}
            </time>
          </dd>
        </dl>
      </div>

      {match.skill_coverage === null ? (
        <Alert tone="info" title="No skills to compare">
          The advert doesn’t name any skills we recognise, so the score comes from how closely the
          wording matches alone.
        </Alert>
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          <RequirementList
            title="Missing"
            requirements={match.missing_skills}
            icon={<X aria-hidden="true" className="size-4 text-oxblood" />}
            empty="Nothing: your resume shows every skill the advert names."
          />
          <RequirementList
            title="Covered"
            requirements={match.matched_skills}
            icon={<Check aria-hidden="true" className="size-4 text-forest" />}
            empty="None of the skills the advert names."
          />
          {!match.sections_detected && (
            <p className="text-sm text-muted-foreground md:col-span-2">
              The advert doesn’t separate requirements from nice-to-haves, so every skill counts as
              required.
            </p>
          )}
        </div>
      )}

      {match.suggested_keywords.length > 0 && (
        <Section title="Keywords to consider">
          <p className="text-sm text-muted-foreground">
            Words the advert stresses that your resume doesn’t use. Add them only where they’re true
            of you.
          </p>
          <ul className="flex flex-wrap gap-2">
            {match.suggested_keywords.map((keyword) => (
              <li key={keyword}>
                <Badge variant="secondary" className="text-sm">
                  {keyword}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {match.evidence.length > 0 && (
        <Section title="Closest lines">
          <p className="text-sm text-muted-foreground">
            The advert’s lines that your resume matched best, closest first.
          </p>
          <ol className="grid border-t">
            {match.evidence.map((pair) => (
              <li
                key={`${pair.jd_text}|${pair.resume_text}`}
                className="grid gap-1 border-b py-3 sm:grid-cols-2 sm:gap-6"
              >
                <p>
                  <span className="sr-only">Advert: </span>
                  {pair.jd_text}
                </p>
                <p className="text-muted-foreground">
                  <span className="sr-only">Your resume: </span>
                  {pair.resume_text}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <p className="text-sm text-muted-foreground">
        The score estimates how much your resume overlaps with the advert. It isn’t how an employer
        or an applicant tracking system will rank you.
      </p>
    </article>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="grid gap-3">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RequirementList({
  title,
  requirements,
  icon,
  empty,
}: Readonly<{
  title: string;
  requirements: SkillRequirement[];
  icon: ReactNode;
  empty: string;
}>) {
  return (
    <Section title={`${title} (${requirements.length})`}>
      {requirements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid border-t">
          {requirements.map((requirement) => (
            <li key={requirement.label} className="flex items-center gap-2 border-b py-2">
              {icon}
              <span className="min-w-0 flex-1">{requirement.label}</span>
              {!requirement.required && <Badge variant="outline">Nice to have</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export { MatchResult };
