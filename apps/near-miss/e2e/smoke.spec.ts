import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { planReady, tapPlan } from './helpers';

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await planReady(page);
  await assertNoHorizontalScroll(page);

  // File a report from the plan's Report button.
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report a hazard' })).toBeVisible();
  await page.getByLabel('Site').selectOption({ label: 'Northgate Distribution Centre' });
  await tapPlan(page, 60, 36);
  await expect(page.getByTestId('picked-zone')).toHaveText('Canteen and lockers');
  await page.getByRole('radio', { name: 'Slip or trip' }).click();
  await page.getByRole('radio', { name: 'Medium' }).click();
  await page.getByLabel('What happened').fill('Smoke test: wet floor by the canteen doors, no sign.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByTestId('report-sent')).toBeVisible();
  await assertNoHorizontalScroll(page);

  // See it on the plan (focused, with its card) and in the list.
  await page.getByRole('link', { name: 'See it on the plan' }).click();
  await expect(page.getByTestId('pin-card')).toContainText('Smoke test: wet floor by the canteen doors');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByRole('link', { name: 'Smoke test: wet floor by the canteen doors, no sign.' })).toBeVisible();
  await assertNoHorizontalScroll(page);

  for (const path of ['/fixes', '/indicators', '/toolbox', '/about']) {
    await openApp(page, path);
    await expect(page.locator('main h1')).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalScroll(page);
  }
  consoleWatch.assertClean();
});
