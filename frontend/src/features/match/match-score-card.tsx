import type { Match } from '@/types/match';

/** "3 of 5 skills covered, 1 required missing", or why there are no skills to count. */
function skillsSummary(match: Match): string {
  if (match.skill_coverage === null) {
    return 'the advert names no skills we recognise, so the score is from wording alone';
  }
  const total = match.matched_skills.length + match.missing_skills.length;
  const requiredMissing = match.missing_skills.filter((r) => r.required).length;
  const covered = `${match.matched_skills.length} of ${total} skills covered`;
  return requiredMissing ? `${covered}, ${requiredMissing} required missing` : covered;
}

/**
 * The headline of a result: the score and what it rests on. The full breakdown
 * (requirements, keywords, evidence) builds on this.
 */
function MatchScoreCard({ match }: Readonly<{ match: Match }>) {
  return (
    <section
      aria-labelledby={`match-${match.id}-score`}
      className="grid gap-2 rounded-lg border bg-card px-5 py-4"
    >
      <h2 id={`match-${match.id}-score`} className="kicker text-primary-text">
        Match score
      </h2>
      <p className="flex items-baseline gap-2">
        <span className="figures font-display text-5xl font-semibold">{match.score}</span>{' '}
        <span className="text-muted-foreground">out of 100</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {match.resume_label} · {skillsSummary(match)}
      </p>
    </section>
  );
}

export { MatchScoreCard };
