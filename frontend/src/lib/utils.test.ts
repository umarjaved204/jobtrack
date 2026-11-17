import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins conditional classes', () => {
    const isHidden: boolean = false;
    expect(cn('px-2', isHidden && 'hidden', { 'font-semibold': true, italic: false })).toBe(
      'px-2 font-semibold',
    );
  });

  it('lets later classes win conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('bg-primary', 'bg-card')).toBe('bg-card');
  });

  it('treats custom display sizes as font sizes, not colours', () => {
    expect(cn('text-display', 'text-primary-text')).toBe('text-display text-primary-text');
    expect(cn('text-display-sm', 'text-display-lg')).toBe('text-display-lg');
    expect(cn('text-sm', 'text-numeral')).toBe('text-numeral');
  });

  it('knows the custom easing curves', () => {
    expect(cn('ease-out', 'ease-out-quint')).toBe('ease-out-quint');
  });
});
