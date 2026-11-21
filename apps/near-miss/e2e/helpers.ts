import { expect, type Page } from '@playwright/test';

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** The Today list: the side panel on desktop, a bottom sheet behind a button on phones. */
export async function today(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: /^Today/ }).click();
    return page.getByRole('dialog', { name: 'Today' });
  }
  return page.getByRole('complementary', { name: 'Today' });
}

export const pins = (page: Page) => page.getByTestId('pins').locator('[data-report]');

/** Wait for the plan to draw its pins. */
export async function planReady(page: Page, site = 'Northgate Distribution Centre') {
  await expect(page.getByTestId('site-plan')).toHaveAttribute('data-site', site);
  await expect(pins(page).first()).toBeVisible();
}

/** Tap a zone on the Report form's plan by grid coordinates (the plan is a 100 × 60 grid). */
export async function tapPlan(page: Page, gx: number, gy: number) {
  const plan = page.getByTestId('pick-plan');
  await plan.scrollIntoViewIfNeeded();
  const box = await plan.boundingBox();
  if (!box) throw new Error('no plan');
  // viewBox is -12 -12 1024 624 (10 units per grid square).
  const k = box.width / 1024;
  await plan.click({ position: { x: (gx * 10 + 12) * k, y: (gy * 10 + 12) * k } });
}

/** Label text, allowing the required-field asterisk. */
export const field = (name: string) => new RegExp(`^${name}\s*\*?$`);
