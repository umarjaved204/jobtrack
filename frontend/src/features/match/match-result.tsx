import { format } from 'date-fns/format';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Match, SkillRequirement } from '@/types/match';

import {
  BAND_LABELS,
  PARTIAL_FROM,
  percent,
  type ScoreBand,
  scoreBand,
  SKILLS_WEIGHT,
  STRONG_FROM,
} from './score-band';

type MatchResultProps = {
  match: Match;
  /** Shown on results scored with an older matcher (and wherever a re-run makes sense). */
  onRerun?: () => void;
  className?: string;
};

/**
 * A saved match, explained: the score on the band scale and its two parts, the lines that
 * matched best, the requirements missing and covered, and keywords to consider.
 */
function MatchResult({ match, onRerun, className }: Readonly<MatchResultProps>) {
  const headingId = `match-${match.id}-score`;
  const band = scoreBand(match.score);
  const skillsShare = match.skill_coverage === null ? 0 : SKILLS_WEIGHT;
  return (
    <article aria-labelledby={headingId} className={cn('grid min-w-0 gap-7', className)}>
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

      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={headingId} className="kicker">
          Match score
        </h2>
        <p className="text-[0.8125rem] text-muted-foreground">
          Scored{' '}
          <time dateTime={match.created_at} className="figures">
            {format(new Date(match.created_at), 'd MMM yyyy, HH:mm')}
          </time>{' '}
          · {match.resume_label}
          {match.application_id && (
            <>
              {' '}
              · for{' '}
              <Link
                to={`/applications/${match.application_id}`}
                className="font-semibold text-foreground underline underline-offset-2 hover:text-primary-text"
              >
                {match.company} · {match.role_title}
              </Link>
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-5 border-b border-rule pb-6">
        <p className="font-display leading-[0.8] font-medium tracking-[-0.04em]">
          <span className="sr-only">{match.score} out of 100</span>
          <span aria-hidden="true" className="text-[clamp(6rem,16vw,10.5rem)] tabular-nums">
            {match.score}
            <span className="text-4xl tracking-normal text-muted-foreground">/100</span>
          </span>
        </p>
        <div className="grid min-w-64 flex-1 gap-2.5">
          <p className="font-display text-3xl font-semibold">{BAND_LABELS[band]}</p>
          <BandScale score={match.score} band={band} />
          <p className="text-[0.8125rem] text-muted-foreground">
            An estimate of how much your resume overlaps with the advert. It isn’t how an employer
            or an applicant tracking system will rank you.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Part
          label="Skills covered"
          share={skillsShare}
          value={match.skill_coverage}
          caption={
            match.skill_coverage === null
              ? 'The advert names no skills we recognise'
              : skillsCaption(match)
          }
        />
        <Part
          label="Wording match"
          share={1 - skillsShare}
          value={match.semantic_score}
          caption="How closely your resume’s lines say what the advert’s lines say"
        />
      </div>

      {match.evidence.length > 0 && (
        <Section title="The evidence">
          <p className="text-sm text-muted-foreground">
            The advert’s lines that your resume matched best, closest first.
          </p>
          <ol className="grid">
            {match.evidence.map((pair) => (
              <li
                key={`${pair.jd_text}|${pair.resume_text}`}
                className="grid gap-3 border-t py-3.5 sm:grid-cols-2 sm:gap-6"
              >
                <div className="grid content-start gap-1">
                  <p className="kicker text-muted-foreground">The advert</p>
                  <p className="text-[0.9375rem] leading-snug">{pair.jd_text}</p>
                </div>
                <div className="grid content-start gap-1">
                  <p className="kicker text-muted-foreground">Your resume</p>
                  <p className="font-display leading-snug italic">{pair.resume_text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {match.skill_coverage === null ? (
        <Alert tone="info" title="No skills to compare">
          The advert doesn’t name any skills we recognise, so the score comes from how closely the
          wording matches alone.
        </Alert>
      ) : (
        <div className="grid gap-x-7 gap-y-6 border-t border-rule pt-5 md:grid-cols-2">
          <RequirementList
            title="Missing from your resume"
            requirements={match.missing_skills}
            missing
            empty="Nothing: your resume shows every skill the advert names."
          />
          <RequirementList
            title="Covered"
            requirements={match.matched_skills}
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
        <Section title="Words worth using">
          <p className="text-[0.9375rem] leading-relaxed">
            The advert stresses these and your resume doesn’t use them. Add them only where they’re
            true of you:
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {match.suggested_keywords.map((keyword) => (
              <li key={keyword} className="font-semibold">
                {keyword}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

const BANDS: { band: ScoreBand; label: string; from: number; to: number }[] = [
  { band: 'little', label: 'Little', from: 0, to: PARTIAL_FROM },
  { band: 'partial', label: 'Partial', from: PARTIAL_FROM, to: STRONG_FROM },
  { band: 'strong', label: 'Strong', from: STRONG_FROM, to: 100 },
];

/** The three bands to scale, this one inked, with a mark at the score. */
function BandScale({ score, band }: { score: number; band: ScoreBand }) {
  return (
    <div
      role="img"
      aria-label={`Score bands: little overlap below ${PARTIAL_FROM}, partial ${PARTIAL_FROM} to ${STRONG_FROM - 1}, strong ${STRONG_FROM} and above. This match is ${score}.`}
      className="relative flex h-7.5 text-xs font-semibold"
    >
      {BANDS.map((b) => (
        <span
          key={b.band}
          style={{ flexGrow: b.to - b.from }}
          className={cn(
            'basis-0 truncate px-2 py-1.5',
            b.band === band ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
          )}
        >
          {b.label}
        </span>
      ))}
      <span
        aria-hidden="true"
        className="absolute -inset-y-2 w-[3px] -translate-x-1/2 bg-primary"
        style={{ left: `${Math.min(Math.max(score, 1), 99)}%` }}
      />
    </div>
  );
}

/** One of the score's two parts: its share, value, a bar and what it measures. */
function Part({
  label,
  share,
  value,
  caption,
}: {
  label: string;
  /** 0–1: the part's weight in the score. */
  share: number;
  value: number | null;
  caption: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <p className="kicker text-muted-foreground">
        {label} · {percent(share)} of score
      </p>
      <p className="font-display text-[2.125rem] leading-none font-medium tabular-nums">
        {value === null ? '–' : percent(value)}
      </p>
      <div aria-hidden="true" className="h-2.5 bg-muted">
        <div className="h-full bg-foreground" style={{ width: percent(value ?? 0) }} />
      </div>
      <p className="text-sm">{caption}</p>
    </div>
  );
}

/** "2 of 3 required · 1 of 2 nice-to-have (count half)". */
function skillsCaption(match: Match) {
  const count = (list: SkillRequirement[], required: boolean) =>
    list.filter((r) => r.required === required).length;
  const parts: string[] = [];
  for (const required of [true, false]) {
    const met = count(match.matched_skills, required);
    const total = met + count(match.missing_skills, required);
    if (total > 0) parts.push(`${met} of ${total} ${required ? 'required' : 'nice-to-have'}`);
  }
  if (parts.length === 2) parts[1] += ' (count half)';
  return parts.join(' · ');
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="grid gap-2.5">
      <h3 className="font-display text-2xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RequirementList({
  title,
  requirements,
  missing = false,
  empty,
}: Readonly<{
  title: string;
  requirements: SkillRequirement[];
  /** Missing required skills get the heavy red outline. */
  missing?: boolean;
  empty: string;
}>) {
  return (
    <Section title={`${title} (${requirements.length})`}>
      {requirements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {requirements.map((requirement) => (
            <li
              key={requirement.label}
              className={cn(
                'border px-2.5 py-1 text-sm',
                missing && requirement.required
                  ? 'border-2 border-oxblood font-semibold text-oxblood'
                  : 'border-input',
              )}
            >
              {requirement.label}
              {!requirement.required && (
                <span className="text-muted-foreground"> · nice to have</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export { MatchResult };
