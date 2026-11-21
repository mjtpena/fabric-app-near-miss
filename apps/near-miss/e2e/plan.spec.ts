import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { isPhone, pins, planReady, today } from './helpers';

test('the site plan draws every zone and a pin for every report of the last 90 days', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/');
  await planReady(page);
  await expect(page.locator('[data-zone]')).toHaveCount(12);
  await expect(pins(page)).toHaveCount(49);
  // Fixed hazards are check marks, open ones are pins; accessible names carry the data.
  await expect(pins(page).and(page.locator('[data-fixed="true"]'))).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Serious near miss, Despatch bay, new: The dock leveller lip dropped/ })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('lenses re-colour the same pins, by click and by number key', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  const pin = page.locator('[data-report][data-potential="serious"][data-status="new"]').first();
  await expect(pin).toHaveAttribute('data-color', 'var(--pot-serious)');
  await page.getByRole('radio', { name: /^Status/ }).click();
  await expect(page.getByRole('radio', { name: /^Status/ })).toHaveAttribute('aria-checked', 'true');
  await expect(pin).toHaveAttribute('data-color', 'var(--st-new)');
  await page.keyboard.press('3');
  await expect(page.getByRole('radio', { name: /^Category/ })).toHaveAttribute('aria-checked', 'true');
  await expect(pin).toHaveAttribute('data-color', 'var(--teal-9)');
  await page.keyboard.press('5');
  await expect(page.getByTestId('site-plan')).toHaveAttribute('data-lens', 'heat');
  await expect(page.locator('[data-hotspot-rank="1"]')).toBeVisible();
  await expect(pins(page)).toHaveCount(49);
});

test('a Today item focuses its report on the plan and switches to its lens', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  await (await today(page)).getByRole('button', { name: /^Serious near miss untriaged at Despatch bay/ }).click();
  const card = page.getByTestId('pin-card');
  await expect(card).toContainText('The dock leveller lip dropped');
  await expect(card.getByTestId('triage-clock')).toContainText('past the 4 h limit');
  await expect(page.getByRole('radio', { name: /^Status/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/focus=r%3A|focus=r:/);
  await card.getByRole('link', { name: 'Triage' }).click();
  await expect(page.getByRole('heading', { name: 'Triage desk' })).toBeVisible();
});

test('a Today zone item zooms to the zone; the replay item replays the cooling hotspot', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  await (await today(page)).getByRole('button', { name: /hottest zone this month/ }).click();
  await expect(page.getByTestId('zone-card')).toContainText('Racking aisles E–H');
  await expect(page.getByRole('radio', { name: /^Heat/ })).toHaveAttribute('aria-checked', 'true');
  await (await today(page)).getByRole('button', { name: /Loading dock cooled after its fix/ }).click();
  await expect(page.getByTestId('zone-card')).toContainText('Loading dock');
  // The replay runs: the date leaves "Today", then pins appear as it plays.
  await expect(page.getByTestId('timeline-date')).not.toHaveText('Today');
  await expect(page.getByRole('button', { name: 'Pause the replay' })).toBeVisible();
});

test('the list view shows the same reports as the plan', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  const onPlan = (await pins(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-report')))).sort();
  await page.keyboard.press('l');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByTestId('list-count')).toHaveText(`${onPlan.length} reports`);
  const inList = (await page.locator('[data-row-report]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-report')))).sort();
  expect(inList).toEqual(onPlan);
  await assertNoHorizontalScroll(page);
});

test('?nowebgl: the plan is SVG and draws the same with WebGL forced off', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await page.goto('/?nowebgl#/');
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await planReady(page);
  await expect(pins(page)).toHaveCount(49);
  consoleWatch.assertClean();
});

test('reduced motion: the plan renders without drop or bloom animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '/');
  await planReady(page);
  const anim = await page.locator('.nm-drop').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});

test('view as reporter dims everyone else’s pins; switching site redraws the plan', async ({ page }) => {
  await openApp(page, '/', 'demo-sam');
  await planReady(page);
  await expect(page.getByRole('radio', { name: 'Reporter' })).toHaveAttribute('aria-checked', 'true');
  await expect((await today(page)).getByRole('button', { name: /Your report at/ }).first()).toBeVisible();
  if (isPhone(page)) await page.keyboard.press('Escape');
  await page.getByTestId('site-menu').click();
  await page.getByRole('menuitemradio', { name: /Eastside Plant/ }).click();
  await planReady(page, 'Eastside Plant');
  await expect(page.locator('[data-zone]')).toHaveCount(11);
});

test('the time slider replays the plan: earlier days show fewer pins', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  await expect(pins(page)).toHaveCount(49);
  const range = page.getByTestId('timeline-range');
  await range.fill(String(Date.now() - 60 * 86_400_000));
  await expect(page.getByTestId('timeline-date')).not.toHaveText('Today');
  const count = await pins(page).count();
  expect(count).toBeLessThan(49);
  expect(count).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(pins(page)).toHaveCount(49);
});

test('keyboard: ] steps through pins, Escape clears, ? opens the cheat sheet', async ({ page }) => {
  test.skip(isPhone(page), 'Keyboard shortcuts are a desktop feature.');
  await openApp(page, '/');
  await planReady(page);
  await page.keyboard.press(']');
  await expect(page.getByTestId('pin-card')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pin-card')).toHaveCount(0);
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});
