import { describe, expect, it } from 'vitest';

import { monogram } from './monogram';

describe('monogram', () => {
  it('takes the first letters of the first two words, or two letters of one word', () => {
    expect(monogram('Octopus Energy')).toBe('OE');
    expect(monogram('Thought Machine Ltd')).toBe('TM');
    expect(monogram('Monzo')).toBe('MO');
    expect(monogram('  wise  ')).toBe('WI');
  });
});
