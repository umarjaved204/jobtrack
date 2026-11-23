// Full-page screenshots of the main screens, for before/after design review (Phase 10
// redesign; the target look is docs/design/redesign/). Not a test: nothing is compared
// automatically. Output goes to frontend/screenshots/<label>/ (git-ignored).
//
//   pnpm screenshots before          # or: after, after-tokens, ...
//   SCREENSHOT_BASE_URL=http://localhost:4173 pnpm screenshots after   # a preview build
//
// Needs the app running (docker compose up, or pnpm dev with the API) and the demo data
// (`uv run python -m scripts.seed` in backend/). Chromium: `pnpm exec playwright install
// chromium` once.
//
// - Signs in once per run: login is rate limited per email (5 per 5 minutes), and refresh
//   tokens rotate, so contexts can't share a saved session. Width and colour scheme change
//   inside the one context instead (the demo user's theme is "system", so the app follows
//   the emulated scheme).
// - Reduced motion, so captures don't land mid-transition.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.SCREENSHOT_EMAIL ?? 'sam.okafor@jobtrack-demo.com';
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'demo-password-2026';
const LABEL = process.argv[2] ?? 'current';
const ONLY = process.argv[3]?.split(','); // optional: a comma-separated list of shot names

if (!/^[a-z0-9-]+$/.test(LABEL)) {
  console.error('The label is a folder name: lower case, digits and hyphens.');
  process.exit(1);
}
const OUT = join(ROOT, 'screenshots', LABEL);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
const SCHEMES = ['light', 'dark'];

/** Signed-out pages. */
const PUBLIC_SHOTS = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
];

/** Signed-in pages; `then` sets up a state after the page loads. */
const APP_SHOTS = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'board', path: '/applications' },
  { name: 'table', path: '/applications?view=table' },
  { name: 'detail', path: firstApplicationPath },
  {
    name: 'form',
    path: '/applications',
    then: async (page) => {
      await page.getByRole('button', { name: 'Add application' }).first().click();
      await page.getByRole('dialog').waitFor();
    },
  },
  { name: 'calendar', path: '/calendar' },
  { name: 'resumes', path: '/resumes' },
  { name: 'match', path: '/match' },
  { name: 'settings', path: '/settings' },
  {
    name: 'palette',
    path: '/dashboard',
    then: async (page) => {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
      await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
    },
  },
];

/** The newest application's detail page, found through the table. */
async function firstApplicationPath(page) {
  await page.goto(`${BASE_URL}/applications?view=table`);
  const link = page.locator('table a[href^="/applications/"]').first();
  await link.waitFor();
  return link.getAttribute('href');
}

/** Wait until the page has settled: data loaded, fonts in, entrance transitions done. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {}); // prettier-ignore
  await page.waitForTimeout(600); // fades still run under reduced motion
}

async function capture(page, shot, viewport, scheme) {
  if (ONLY && !ONLY.includes(shot.name)) return;
  const path = typeof shot.path === 'function' ? await shot.path(page) : shot.path;
  await page.goto(`${BASE_URL}${path}`);
  await settle(page);
  if (shot.then) {
    await shot.then(page);
    await settle(page);
  }
  const file = join(OUT, `${shot.name}--${viewport}--${scheme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${file.slice(ROOT.length + 1)}`);
}

async function shootAll(page, shots) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const shot of shots) await capture(page, shot, viewport, scheme);
    }
  }
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  console.log(`Screenshots of ${BASE_URL} → screenshots/${LABEL}/`);

  const visitor = await browser.newContext();
  await shootAll(await visitor.newPage(), PUBLIC_SHOTS);
  await visitor.close();

  const member = await browser.newContext();
  const page = await member.newPage();
  await signIn(page);
  await shootAll(page, APP_SHOTS);
  await member.close();
} finally {
  await browser.close();
}
