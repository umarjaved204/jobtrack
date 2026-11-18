import { describe, expect, it } from 'vitest';

import { parseRange, periodFor } from './range';

describe('parseRange', () => {
  it('reads a known range and falls back to 90 days otherwise', () => {
    expect(parseRange('30d')).toBe('30d');
    expect(parseRange('all')).toBe('all');
    expect(parseRange(null)).toBe('90d');
    expect(parseRange('7d')).toBe('90d');
    expect(parseRange('ALL')).toBe('90d');
  });
});

describe('periodFor', () => {
  it('counts today as the last day of the range', () => {
    expect(periodFor('30d', '2026-11-18')).toEqual({ from: '2026-10-20', to: '2026-11-18' });
    expect(periodFor('90d', '2026-11-18')).toEqual({ from: '2026-08-21', to: '2026-11-18' });
  });

  it('crosses month, year and leap-day boundaries by calendar day', () => {
    expect(periodFor('30d', '2027-01-15')).toEqual({ from: '2026-12-17', to: '2027-01-15' });
    expect(periodFor('30d', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-03-01' }); // 29 Feb counted
  });

  it('leaves both ends open for all time', () => {
    expect(periodFor('all', '2026-11-18')).toEqual({});
  });
});
