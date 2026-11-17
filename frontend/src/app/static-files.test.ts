import { describe, expect, it } from 'vitest';

import indexHtml from '../../index.html?raw';
import favicon from '../../public/favicon.svg?raw';
import robots from '../../public/robots.txt?raw';

/*
 * Without these files the SPA fallback answers /robots.txt and /favicon.ico with
 * index.html (Lighthouse: "robots.txt is not valid", console 404 for the icon).
 */
describe('static files', () => {
  it('robots.txt is plain directives: public pages allowed, API excluded', () => {
    const directives = robots
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    expect(directives).toEqual(['User-agent: *', 'Allow: /', 'Disallow: /api/']);
    expect(robots).not.toMatch(/<html/i);
  });

  it('index.html links an SVG favicon that exists', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const icon = doc.querySelector('link[rel="icon"]');

    expect(icon?.getAttribute('href')).toBe('/favicon.svg');
    expect(icon?.getAttribute('type')).toBe('image/svg+xml');
    expect(favicon.trim()).toMatch(/^<svg[^>]+viewBox="0 0 32 32"/);
  });
});
