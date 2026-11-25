import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/components/ui/skeleton';

import { Loading } from './loading';

describe('Loading', () => {
  it('marks the region busy and names it in text screen readers read', () => {
    render(
      <Loading label="Loading the calendar" className="grid">
        <Skeleton className="h-8" />
      </Loading>,
    );

    const label = screen.getByText('Loading the calendar');
    expect(label).toHaveClass('sr-only');
    const region = label.parentElement;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveClass('grid');
    // No aria-label on a generic element: ARIA doesn't allow naming one.
    expect(region).not.toHaveAttribute('aria-label');
    // The skeletons themselves stay hidden from assistive tech.
    expect(region?.querySelector('[data-slot="skeleton"]')).toHaveAttribute('aria-hidden', 'true');
  });
});
