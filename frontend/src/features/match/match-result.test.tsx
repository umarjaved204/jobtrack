import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { makeMatch } from '@/test/fake-applications';
import type { Match } from '@/types/match';

import { MatchResult } from './match-result';
import { scoreBand } from './score-band';

function renderResult(overrides: Partial<Match> = {}, onRerun?: () => void) {
  const match = makeMatch(overrides);
  const router = createMemoryRouter([
    { path: '/', element: <MatchResult match={match} onRerun={onRerun} /> },
  ]);
  render(<RouterProvider router={router} />);
  return match;
}

const list = (name: RegExp) =>
  within(screen.getByRole('heading', { name }).parentElement as HTMLElement);

describe('MatchResult', () => {
  it('leads with the score, its band and its two parts', () => {
    renderResult({ score: 72, skill_coverage: 2 / 3, semantic_score: 0.8 });
    const article = screen.getByRole('article', { name: 'Match score' });
    expect(article).toHaveTextContent('72 out of 100');
    expect(article).toHaveTextContent('Strong overlap');
    expect(article).toHaveTextContent('Skills covered · 60% of score67%');
    expect(article).toHaveTextContent('Wording match · 40% of score80%');
    expect(article).toHaveTextContent(/isn’t how an employer/);
  });

  it('marks the score on the band scale', () => {
    renderResult({ score: 48 });
    expect(screen.getByRole('img', { name: /This match is 48\./ })).toHaveAccessibleName(
      'Score bands: little overlap below 35, partial 35 to 64, strong 65 and above. This match is 48.',
    );
    expect(screen.getByRole('article')).toHaveTextContent('Partial overlap');
  });

  it('lists missing and covered requirements, marking nice-to-haves', () => {
    renderResult({
      missing_skills: [
        { skills: ['GraphQL'], label: 'GraphQL', required: true },
        { skills: ['Vue', 'Svelte'], label: 'Vue or Svelte', required: false },
      ],
    });
    const missing = list(/^Missing from your resume \(2\)/);
    expect(missing.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'GraphQL',
      'Vue or Svelte · nice to have',
    ]);
    expect(list(/^Covered \(2\)/).getByText('React')).toBeVisible();
    expect(screen.getByRole('article')).toHaveTextContent(
      '2 of 3 required · 0 of 1 nice-to-have (count half)',
    );
  });

  it('says when the advert didn’t separate requirements from nice-to-haves', () => {
    renderResult({ sections_detected: false });
    expect(screen.getByText(/every skill counts as required/)).toBeVisible();
  });

  it('explains a score from wording alone', () => {
    renderResult({ skill_coverage: null, matched_skills: [], missing_skills: [] });
    expect(screen.getByText('No skills to compare')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /^Missing/ })).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Skills covered · 0% of score–');
    expect(screen.getByRole('article')).toHaveTextContent('Wording match · 100% of score');
  });

  it('shows keywords and the closest lines', () => {
    renderResult();
    expect(list(/Words worth using/).getByText('GraphQL')).toBeVisible();
    const pair = list(/The evidence/).getByRole('listitem');
    expect(pair).toHaveTextContent('The advertReact and TypeScript');
    expect(pair).toHaveTextContent('Your resumeReact, TypeScript, Playwright');
  });

  it('links the application it was matched for', () => {
    renderResult({ application_id: 'app-1', company: 'Monzo', role_title: 'Frontend Engineer' });
    expect(screen.getByRole('link', { name: 'Monzo · Frontend Engineer' })).toHaveAttribute(
      'href',
      '/applications/app-1',
    );
  });

  it('offers a re-run for results from an older matcher', async () => {
    const onRerun = vi.fn();
    renderResult({ is_current: false }, onRerun);
    expect(screen.getByText('Scored with an older version of the matcher')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(onRerun).toHaveBeenCalledOnce();
  });

  it('shows no older-version notice for current results', () => {
    renderResult({ is_current: true });
    expect(screen.queryByText(/older version/)).not.toBeInTheDocument();
  });
});

describe('scoreBand', () => {
  it('uses the cut-offs from the labelled pairs', () => {
    expect([100, 65, 64, 35, 34, 0].map(scoreBand)).toEqual([
      'strong',
      'strong',
      'partial',
      'partial',
      'little',
      'little',
    ]);
  });
});
