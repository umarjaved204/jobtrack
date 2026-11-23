import { describe, expect, it } from 'vitest';

import { describeProgress } from './progress-text';

describe('describeProgress while the model loads', () => {
  it('shows a download in megabytes when the model comes from the network', () => {
    expect(
      describeProgress({ phase: 'loading-model', source: 'network', loaded: 17e6, total: 34e6 }),
    ).toEqual({ label: 'Downloading the match model', detail: '17.0 of 34.0 MB', fraction: 0.5 });
  });

  it('says loading, with no megabytes, when the model comes from the browser cache', () => {
    expect(
      describeProgress({ phase: 'loading-model', source: 'cache', loaded: 17e6, total: 34e6 }),
    ).toEqual({ label: 'Loading the match model', detail: null, fraction: 0.5 });
  });

  it('says starting before any bytes, and once they have all arrived', () => {
    for (const source of ['network', 'cache'] as const) {
      expect(describeProgress({ phase: 'loading-model', source, loaded: 0, total: 0 })).toEqual({
        label: 'Starting the match model',
        detail: null,
        fraction: null,
      });
      expect(
        describeProgress({ phase: 'loading-model', source, loaded: 34e6, total: 34e6 }).label,
      ).toBe('Starting the match model');
    }
  });
});
