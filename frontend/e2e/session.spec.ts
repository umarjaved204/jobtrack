// The harness itself, in a real browser: a session made through the API is restored from
// the refresh cookie, survives a reload (the cookie rotates), and sign-out ends it.
import { signUpViaApi } from './support/api.ts';
import { expect, test } from './support/fixtures.ts';

test('a session survives a reload and ends at sign-out', async ({ page, context }) => {
  const user = await signUpViaApi(context);

  await page.goto('/dashboard');
  const heading = page.getByRole('heading', { level: 1, name: 'Dashboard' });
  await expect(heading).toBeVisible();
  await expect(page.getByText('Your figures start with your first application')).toBeVisible();

  await page.reload();
  await expect(heading).toBeVisible();

  await page.getByRole('button', { name: `Account: ${user.fullName}` }).click();
  const loggedOut = page.waitForResponse('**/api/v1/auth/logout');
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  expect((await loggedOut).status()).toBe(204);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
