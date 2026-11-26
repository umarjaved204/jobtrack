// Flow 2, the AI match in the production build: the page is cross-origin isolated, the
// model comes from our own origin (no request leaves it), the embedding worker finishes
// and a score lands in the right band. The texts are a labelled pair from the calibration
// set (synthetic people): "the role this resume is for", which scores 78-99 (docs/
// architecture.md "Match scoring"), so the assertion is the band, not an exact score.
import { readFile } from 'node:fs/promises';

import { createResume, signUpViaApi } from './support/api.ts';
import { BASE_URL } from './support/env.ts';
import { expect, test } from './support/fixtures.ts';

const PAIRS = new URL('../../backend/scripts/calibration_data/', import.meta.url);
const text = (path: string) => readFile(new URL(path, PAIRS), 'utf8');

test('a match runs on the device and scores a strong pair as strong', async ({
  page,
  context,
  issues,
}) => {
  // The first run downloads ~35 MB and embeds both texts; CI runners are slow at both.
  test.setTimeout(180_000);

  // Every request the browser makes, workers included: none may leave our origin.
  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));

  const user = await signUpViaApi(context);
  await createResume(context, user, {
    label: 'Frontend (React)',
    contentText: await text('resumes/frontend_react.txt'),
  });

  await page.goto('/match');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

  await page.getByLabel('Job description').fill(await text('jds/frontend_react.txt'));
  await page.getByRole('button', { name: 'Score this match' }).click();

  // A fresh browser has no cached model: the page asks before downloading it.
  const consent = page.getByRole('dialog', { name: 'Download the match model?' });
  await expect(consent).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/match'),
    { timeout: 150_000 },
  );
  await consent.getByRole('button', { name: 'Download and match' }).click();

  expect((await saved).status()).toBe(201);
  const result = page.getByRole('article', { name: 'Match score' });
  const score = result.getByText(/^\d{1,3} out of 100$/);
  await expect(score).toBeAttached();
  const value = Number.parseInt((await score.textContent()) ?? '', 10);
  test.info().annotations.push({ type: 'score', description: String(value) });
  expect(value).toBeGreaterThanOrEqual(65);
  expect(value).toBeLessThanOrEqual(100);
  await expect(result.getByText('Strong overlap', { exact: true })).toBeVisible();
  // Saved: it's in the history too.
  await expect(page.getByRole('table').getByText('Strong overlap')).toBeVisible();

  // The model came from this origin, and nothing else was fetched from anywhere else.
  expect(requests.some((url) => url.startsWith(`${BASE_URL}/models/`))).toBe(true);
  const foreign = requests.filter((url) => /^https?:/.test(url) && !url.startsWith(BASE_URL));
  expect(foreign).toEqual([]);
  // COEP blocks show up as console errors ("ERR_BLOCKED_BY_RESPONSE", ...); so would
  // anything else going wrong in the page or the worker.
  expect(issues.consoleErrors).toEqual([]);
});
