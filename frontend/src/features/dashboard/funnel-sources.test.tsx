import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { emptyAnalytics, sampleAnalytics } from '@/test/fake-analytics';

import { Funnel } from './funnel';
import { formatRate, isSmallSample, share } from './rates';
import { Sources } from './sources';

const rowsOf = (caption: string) =>
  within(screen.getByRole('table', { name: caption }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));

describe('rate helpers', () => {
  it('formats rates, with a dash for nothing to divide by', () => {
    expect(formatRate(9 / 17)).toBe('53%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(null)).toBe('—');
  });

  it('flags samples of 1 to 4 as too small, but not 0 or 5', () => {
    expect([0, 1, 4, 5].map(isSmallSample)).toEqual([false, true, true, false]);
  });

  it('scales bars to the largest value', () => {
    expect(share(3, 12)).toBe(0.25);
    expect(share(0, 0)).toBe(0);
  });
});

describe('Funnel', () => {
  it('gives each stage its count and the rate from the stage before', () => {
    render(<Funnel funnel={sampleAnalytics().funnel} />);

    expect(rowsOf('Applications reaching each stage')).toEqual([
      ['Applied', '32', 'Not applicable'],
      ['Screening', '17', '53%'],
      ['Interview', '9', '53%'],
      ['Offer', '2', '22%'],
    ]);
    expect(screen.getByText('22% of Interview')).toBeInTheDocument();
  });

  it('grows each bar in from zero, stage by stage, to its share of Applied', async () => {
    const { container } = render(<Funnel funnel={sampleAnalytics().funnel} />);
    const bar = (stage: string) =>
      container.querySelector<HTMLElement>(`[data-stage-bar="${stage}"]`);

    // First paint: every bar at zero, so the transition has something to grow from.
    expect(bar('applied')).toHaveStyle({ width: '0%' });
    await waitFor(() => expect(bar('applied')).toHaveStyle({ width: '100%' }));
    expect(bar('screening')).toHaveStyle({ width: `${(17 / 32) * 100}%` });
    expect(bar('offer')).toHaveStyle({ width: `${(2 / 32) * 100}%` });
    // The stagger is a multiple of a duration token, so reduced motion (tokens at 0) drops it.
    expect(bar('interview')?.style.transitionDelay).toBe('calc(var(--duration-fast) * 2)');
  });

  it('adds the Rejected and Withdrawn totals once the summary has them', () => {
    const { by_status } = sampleAnalytics().summary;
    const { rerender } = render(<Funnel funnel={sampleAnalytics().funnel} />);
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();

    rerender(<Funnel funnel={sampleAnalytics().funnel} outcomes={by_status} />);
    const total = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
    expect(total('Rejected')).toHaveTextContent('13');
    expect(total('Withdrawn')).toHaveTextContent('5');
    expect(screen.getByText('Applied in this period, now withdrawn')).toBeVisible();
  });

  it('says so when nothing was applied for', () => {
    render(<Funnel funnel={emptyAnalytics().funnel} />);
    expect(screen.getByText('Nothing applied for in this period yet.')).toBeVisible();
  });
});

describe('Sources', () => {
  it('lists sources with applied, interviewed and rate; no source reads as Not set', () => {
    render(<Sources sources={sampleAnalytics().sources} />);

    expect(rowsOf('Applications and interviews by source')).toEqual([
      ['LinkedIn', '12', '3', '25%'],
      ['Referral', '7', '4', '57%'],
      ['Company website', '6', '1', '17%'],
      ['Otta', '4', '1', '25% (fewer than 5 applications, too few to compare)'],
      ['Not set', '3', '0', '0% (fewer than 5 applications, too few to compare)'],
    ]);
  });

  it('marks small samples and explains the mark', () => {
    render(<Sources sources={sampleAnalytics().sources} />);

    expect(screen.getByText(/1 interviewed \(25%\*\)/)).toHaveClass('italic');
    expect(screen.getByText(/3 interviewed \(25%\)/)).not.toHaveClass('italic');
    expect(screen.getByText(/Fewer than 5 applications: too few to compare rates/)).toBeVisible();
  });

  it('leaves out the footnote when every source has enough applications', () => {
    render(
      <Sources
        sources={{
          sources: [{ source: 'LinkedIn', applied: 8, interviewed: 2, interview_rate: 0.25 }],
        }}
      />,
    );
    expect(screen.queryByText(/too few to compare/)).not.toBeInTheDocument();
  });

  it('invites adding sources when there are none', () => {
    render(<Sources sources={emptyAnalytics().sources} />);
    expect(screen.getByText(/Add a source to each application/)).toBeVisible();
  });
});
