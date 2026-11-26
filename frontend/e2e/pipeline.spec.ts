// Flow 1, the pipeline: what jsdom can't check. Sign up through the UI, add an
// application, drag its card with a real pointer from Applied to Interview, move it on to
// Offer with the keyboard, and check both moves were saved (board after reload, timeline).
import type { Page } from '@playwright/test';

import { newUser } from './support/api.ts';
import { expect, test } from './support/fixtures.ts';

// The board's container is 81rem: at this width Wishlist to Offer are on screen.
test.use({ viewport: { width: 1440, height: 900 } });

const COMPANY = 'Northwind Logistics';
const ROLE = 'Senior Frontend Engineer';

const column = (page: Page, status: string) => page.locator(`section[data-column="${status}"]`);

/** The next POST /applications/{id}/move. */
const nextMove = (page: Page, id: string) =>
  page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/api/v1/applications/${id}/move`),
  );

function centre(box: { x: number; y: number; width: number; height: number } | null) {
  if (!box) throw new Error('element has no bounding box (not rendered?)');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('add an application, drag it to Interview, keyboard it to Offer', async ({ page }) => {
  const user = newUser('Daniel Mensah');

  await test.step('sign up', async () => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill(user.fullName);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });

  await test.step('add an application in Applied', async () => {
    await page.goto('/applications');
    await page.getByRole('button', { name: 'Add application' }).first().click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Company').fill(COMPANY);
    await form.getByLabel('Role').fill(ROLE);
    await form.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Applied' }).click();
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/applications'),
    );
    await form.getByRole('button', { name: 'Add application' }).click();
    expect((await created).status()).toBe(201);
    await expect(form).toBeHidden();
  });

  const card = column(page, 'applied').locator('article').filter({ hasText: COMPANY });
  await expect(card).toBeVisible();
  const id = await card.getAttribute('data-card');
  if (!id) throw new Error('card has no data-card id');
  const cardIn = (status: string) => column(page, status).locator(`article[data-card="${id}"]`);

  await test.step('drag it from Applied to Interview with the pointer', async () => {
    const target = column(page, 'interview').getByText('Drop a card here');
    await expect(target).toBeInViewport();
    const from = centre(await card.boundingBox());
    const to = centre(await target.boundingBox());

    const moved = nextMove(page, id);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // Past the MouseSensor's 5 px activation distance, in steps like a real hand.
    await page.mouse.move(from.x + 12, from.y + 4, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 25 });
    // The board follows the drag: the card's slot is in Interview before the drop.
    await expect(cardIn('interview')).toBeAttached();
    await page.mouse.up();

    const response = await moved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ status: 'interview' });
  });

  await test.step('the move survives a reload', async () => {
    await page.reload();
    await expect(cardIn('interview')).toBeVisible();
    await expect(cardIn('applied')).toHaveCount(0);
  });

  await test.step('move it on to Offer with the keyboard', async () => {
    const handle = page.getByRole('button', { name: `Move ${COMPANY}, ${ROLE}` });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(cardIn('interview').getByText('Drop here · position 1 of 1')).toBeVisible();

    const moved = nextMove(page, id);
    await page.keyboard.press('ArrowRight');
    await expect(cardIn('offer')).toBeAttached();
    await page.keyboard.press('Space');

    const response = await moved;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ status: 'offer' });
  });

  await test.step('both moves are saved: board and timeline', async () => {
    await page.reload();
    await expect(cardIn('offer')).toBeVisible();

    await page.goto(`/applications/${id}`);
    // Each move is one "Moved from X → Y" line (the arrow is "to" for screen readers).
    const moves = page.locator('p').filter({ hasText: /^Moved from/ });
    await expect(moves).toHaveCount(2);
    await expect(moves.filter({ hasText: /Applied\s*to\s*Interview/ })).toHaveCount(1);
    await expect(moves.filter({ hasText: /Interview\s*to\s*Offer/ })).toHaveCount(1);
  });
});
