import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { applicationStatuses, statusLabels } from '@/types/application';

import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each(applicationStatuses)('renders a text label for %s (colour is not the only cue)', (s) => {
    render(<StatusBadge status={s} />);
    const badge = screen.getByText(statusLabels[s]);
    expect(badge).toHaveAttribute('data-status', s);
    expect(badge.className).toContain(`text-status-${s}`);
    expect(badge.className).toContain(`bg-status-${s}-tint`);
  });

  it('hides the decorative dot from assistive tech', () => {
    const { container } = render(<StatusBadge status="offer" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toHaveTextContent(/^Offer$/);
  });
});
