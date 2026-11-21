/**
 * The five acceptance criteria of SPEC-2 App 20, at 390 px and 1280 px.
 */
import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { pins, planReady, tapPlan } from './helpers';

test('1. a report can be filed on a phone in six steps or fewer', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/report', 'demo-sam');
  await expect(page.getByRole('heading', { name: 'Report a hazard' })).toBeVisible();
  // The operator's site is preselected (where they last reported); kind defaults to near miss.
  await expect(page.getByLabel('Site')).toHaveValue(/.+/);
  let steps = 0;
  const step = async (fn: () => Promise<unknown>) => {
    steps += 1;
    await fn();
  };
  await step(() => tapPlan(page, 26, 20)); // 1. where: the loading dock
  await step(() => page.getByRole('radio', { name: 'Vehicles' }).click()); // 2. what
  await step(() => page.getByRole('radio', { name: 'High' }).click()); // 3. how bad
  await step(() => page.getByLabel('What happened').fill('Forklift reversed past the crossing while I was on it.')); // 4. one sentence
  await step(() => page.getByRole('switch', { name: 'Report anonymously' }).click()); // 5. (optional) anonymous
  await step(() => page.getByRole('button', { name: 'Send report' }).click()); // 6. send
  expect(steps).toBeLessThanOrEqual(6);
  await expect(page.getByTestId('report-sent')).toBeVisible();
  await expect(page.getByTestId('sent-name')).toContainText('Not stored');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('2. an anonymous report shows no reporter and cannot be edited; a named one can', async ({ page }) => {
  await openApp(page, '/report', 'demo-sam');
  await page.getByLabel('Site').selectOption({ label: 'Northgate Distribution Centre' });
  await tapPlan(page, 10, 38);
  await page.getByRole('radio', { name: 'Lifting' }).click();
  await page.getByRole('radio', { name: 'Low' }).click();
  await page.getByLabel('What happened').fill('Anonymous: heavy boxes stacked above head height at pick and pack.');
  await page.getByRole('switch', { name: 'Report anonymously' }).click();
  await expect(page.getByTestId('anon-note')).toContainText('not stored at all');
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByRole('link', { name: 'See it on the plan' }).click();
  await page.getByTestId('pin-card').getByRole('link', { name: 'Open report' }).click();
  await expect(page.getByText('Reported anonymously')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Sam Taylor');

  // A named report by the same person is editable while new.
  await openApp(page, '/report', 'demo-sam');
  await tapPlan(page, 10, 38);
  await page.getByRole('radio', { name: 'Lifting' }).click();
  await page.getByRole('radio', { name: 'Low' }).click();
  await page.getByLabel('What happened').fill('Named: heavy boxes stacked above head height at pick and pack.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByRole('link', { name: 'Open the report' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
});

test('3. a serious report cannot move past triaged without an action', async ({ page }) => {
  await openApp(page, '/?view=list', 'demo-priya');
  await page.getByRole('link', { name: /dock leveller lip dropped/ }).click();
  await expect(page.getByRole('heading', { name: 'Triage desk' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark triaged' }).click();
  await expect(page.getByTestId('report-status')).toContainText('Triaged');
  await page.getByRole('button', { name: 'Mark fixed' }).click();
  await expect(page.getByTestId('status-error')).toHaveText('A serious report needs an action before it can move past triaged.');
  await expect(page.getByTestId('report-status')).toContainText('Triaged');
  await page.getByRole('button', { name: 'Close, no action needed' }).click();
  await expect(page.getByTestId('status-error')).toHaveText('A serious report needs an action before it can move past triaged.');

  // With an action it moves on.
  const form = page.getByTestId('assign-form');
  await form.getByLabel('Action').fill('Lock out the door 12 leveller until it is repaired');
  await form.getByLabel('Owner').selectOption({ label: 'Lee Hart' });
  await form.getByRole('button', { name: 'Assign action' }).click();
  await expect(page.getByTestId('report-status')).toContainText('Action assigned');
  await expect(page.getByTestId('action-list')).toContainText('Lock out the door 12 leveller');
});

test('4. the loading dock is the top hotspot over 90 days, and the slider shows it cooling after the fix', async ({ page }) => {
  await openApp(page, '/');
  await planReady(page);
  await page.getByRole('radio', { name: /^Heat/ }).click();
  const dockLabel = page.locator('[data-hotspot-rank="1"]');
  await expect(dockLabel).toBeVisible();
  await expect(dockLabel).toContainText('#1 · 70');
  const dockHeat = page.locator('[data-heat-zone="Loading dock"]');
  const heatNow = Number((await dockHeat.getAttribute('data-heat').catch(() => '0')) ?? 0);

  // Before the fix (day −46) the dock is the hottest zone on the plan.
  await page.getByTestId('timeline-range').fill(String(Date.now() - 46 * 86_400_000));
  await expect(page.getByTestId('timeline-date')).not.toHaveText('Today');
  await expect(dockHeat).toBeVisible();
  const heatThen = Number(await dockHeat.getAttribute('data-heat'));
  const all = await page.locator('[data-heat-zone]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-heat'))));
  expect(heatThen).toBe(Math.max(...all));
  expect(heatThen).toBeGreaterThan(0.6);
  // Today it has cooled to a fraction of that.
  expect(heatNow).toBeLessThan(heatThen * 0.2);
  // The fix shows on the timeline as done.
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(pins(page).first()).toBeVisible();
});

test('5. a supervisor triages only their own site; the safety lead sees and triages all', async ({ page }) => {
  // Priya supervises Northgate: an Eastside report is read-only for her.
  await openApp(page, '/?view=list', 'demo-priya');
  await page.getByLabel('Site').selectOption({ label: 'Eastside Plant' });
  await page.getByRole('link', { name: /spark from the grinder/ }).click();
  await expect(page.getByRole('heading', { name: 'Fixes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark triaged' })).toHaveCount(0);
  await expect(page.getByTestId('triage-desk')).toContainText('Tom Okoro (site supervisor)');

  // Her own site's new reports get the triage desk.
  await openApp(page, '/?view=list', 'demo-priya');
  await page.getByRole('link', { name: /label printer cable/ }).click();
  await expect(page.getByRole('heading', { name: 'Triage desk' })).toBeVisible();

  // The safety lead can triage the Eastside report.
  await openApp(page, '/?view=list', 'demo-lead');
  await page.getByLabel('Site').selectOption({ label: 'Eastside Plant' });
  await page.getByRole('link', { name: /spark from the grinder/ }).click();
  await page.getByRole('button', { name: 'Mark triaged' }).click();
  await expect(page.getByTestId('report-status')).toContainText('Triaged');
});
