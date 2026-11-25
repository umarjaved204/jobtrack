// Full-page screenshots of the main screens, for before/after design review (Phase 10
// redesign; the target look is docs/design/redesign/). Not a test: nothing is compared
// automatically. Output goes to frontend/screenshots/<label>/ (git-ignored).
//
//   pnpm screenshots before          # or: after, after-tokens, ...
//   pnpm screenshots after match,settings     # only these shots
//   SCREENSHOT_BASE_URL=http://localhost:4173 pnpm screenshots after   # a preview build
//
// Pages, sign-in and setup: app-pages.mjs.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { BASE_URL, runAll } from './app-pages.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LABEL = process.argv[2] ?? 'current';
const ONLY = process.argv[3]?.split(','); // optional: a comma-separated list of shot names

if (!/^[a-z0-9-]+$/.test(LABEL)) {
  console.error('The label is a folder name: lower case, digits and hyphens.');
  process.exit(1);
}
const OUT = join(ROOT, 'screenshots', LABEL);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  console.log(`Screenshots of ${BASE_URL} → screenshots/${LABEL}/`);
  await runAll(browser, ONLY, async (page, shot, viewport, scheme) => {
    const file = join(OUT, `${shot.name}--${viewport}--${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ${file.slice(ROOT.length + 1)}`);
  });
} finally {
  await browser.close();
}
