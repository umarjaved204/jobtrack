// The app's main screens and how to reach them in a real browser, shared by the design
// review screenshots (screenshots.mjs) and the accessibility scan (a11y-audit.mjs).
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

export const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.SCREENSHOT_EMAIL ?? 'sam.okafor@jobtrack-demo.com';
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? 'demo-password-2026';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
export const SCHEMES = ['light', 'dark'];

/** Signed-out pages. */
export const PUBLIC_SHOTS = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
];

/** Signed-in pages; `then` sets up a state after the page loads. */
export const APP_SHOTS = [
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
export async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {}); // prettier-ignore
  await page.waitForTimeout(600); // fades still run under reduced motion
}

/** Load a shot's page and set up its state. */
export async function open(page, shot) {
  const path = typeof shot.path === 'function' ? await shot.path(page) : shot.path;
  await page.goto(`${BASE_URL}${path}`);
  await settle(page);
  if (shot.then) {
    await shot.then(page);
    await settle(page);
  }
}

/** Run `visit(page, shot, viewport, scheme)` for every shot at every width and scheme. */
export async function forEachShot(page, shots, only, visit) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const shot of shots) {
        if (only && !only.includes(shot.name)) continue;
        await open(page, shot);
        await visit(page, shot, viewport, scheme);
      }
    }
  }
}

export async function signIn(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/** Visitor pages in one context, then signed-in pages in another. */
export async function runAll(browser, only, visit) {
  const visitor = await browser.newContext();
  await forEachShot(await visitor.newPage(), PUBLIC_SHOTS, only, visit);
  await visitor.close();

  const member = await browser.newContext();
  const page = await member.newPage();
  await signIn(page);
  await forEachShot(page, APP_SHOTS, only, visit);
  await member.close();
}
