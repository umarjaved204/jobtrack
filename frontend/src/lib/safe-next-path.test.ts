import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGNED_IN_PATH, safeNextPath } from './safe-next-path';

describe('safeNextPath', () => {
  it.each([
    ['/applications', '/applications'],
    ['/applications?status=offer&page=2', '/applications?status=offer&page=2'],
    ['/calendar#week', '/calendar#week'],
    ['/a/../settings', '/settings'], // normalised, still same-origin
    ['/%0d%0a', '/%0d%0a'], // encoded control chars stay encoded: just an unknown path
  ])('accepts same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['applications'], // not rooted
    ['//evil.example'], // protocol-relative
    ['///evil.example'],
    ['/\\evil.example'], // backslash is a slash to browsers
    ['/\\/evil.example'],
    ['\\\\evil.example'],
    ['https://evil.example/dashboard'],
    ['HTTPS://evil.example'],
    ['javascript:alert(1)'],
    [' javascript:alert(1)'],
    ['data:text/html,hi'],
    ['/\t/evil.example'], // tab stripped by browsers → //evil.example
    ['/\n/evil.example'],
  ])('rejects %j', (raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});
