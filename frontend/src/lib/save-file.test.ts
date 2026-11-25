import { afterEach, describe, expect, it, vi } from 'vitest';

import { REVOKE_AFTER_MS, saveFile } from './save-file';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveFile', () => {
  it('clicks a temporary download link, then revokes the blob URL later', () => {
    vi.useFakeTimers();
    // jsdom has no blob URLs.
    const create = vi.fn(() => 'blob:jobtrack/1');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    const blob = new Blob(['{}'], { type: 'application/json' });
    saveFile(blob, 'jobtrack-export.json');

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('jobtrack-export.json');
    expect(clicked[0]?.href).toBe('blob:jobtrack/1');
    expect(document.querySelector('a[download]')).toBeNull(); // removed again
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revoke).toHaveBeenCalledWith('blob:jobtrack/1');
  });
});
