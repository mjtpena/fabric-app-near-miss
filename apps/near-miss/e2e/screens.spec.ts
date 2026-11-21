/**
 * Screenshot set for the design review (docs/redesign/). Skipped in the normal run; record with
 *   SHOTS=1 npx playwright test e2e/screens.spec.ts --project=desktop
 * (the spec sets its own viewports and colour schemes, so one project is enough). ONLY=desktop-light limits it.
 */
import { expect, test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

import { planReady, tapPlan } from './helpers';

const OUT = 'docs/redesign';
const SIZES = [
  { tag: 'desktop', width: 1280, height: 800 },
  { tag: 'mobile', width: 390, height: 844 },
] as const;
const THEMES = ['light', 'dark'] as const;

test.skip(!process.env.SHOTS, 'Set SHOTS=1 to record the redesign screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const settle = (page: Page, ms = 1400) => page.waitForTimeout(ms);
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

async function todayPanel(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: /^Today/ }).click();
    return page.getByRole('dialog', { name: 'Today' });
  }
  return page.getByRole('complementary', { name: 'Today' });
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`${size.tag} ${theme}`, async ({ page }) => {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(`${size.tag}-${theme}`)) test.skip();
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: theme });
      const tag = `${size.tag}-${theme}`;
      const mobile = size.tag === 'mobile';

      await openApp(page, '/');
      await planReady(page);
      await settle(page, 1800);
      await shot(page, `01-plan-potential-${tag}`);

      await page.getByRole('radio', { name: /^Status/ }).click();
      await settle(page, 500);
      await shot(page, `02-plan-status-${tag}`);

      await page.getByRole('radio', { name: /^Category/ }).click();
      await settle(page, 500);
      await shot(page, `03-plan-category-${tag}`);

      await page.getByRole('radio', { name: /^Heat/ }).click();
      await page.getByTestId('timeline-range').fill(String(Date.now() - 46 * 86_400_000));
      await page.mouse.click(2, mobile ? 300 : 400);
      await settle(page, 1400);
      await shot(page, `04-plan-heat-replay-day46-${tag}`);
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await settle(page, 1000);
      await shot(page, `05-plan-heat-today-${tag}`);

      await (await todayPanel(page, mobile)).getByRole('button', { name: /^Serious near miss untriaged/ }).click();
      await expect(page.getByTestId('pin-card')).toBeVisible();
      await settle(page, 1000);
      await shot(page, `06-plan-today-focus-pin-${tag}`);

      await (await todayPanel(page, mobile)).getByRole('button', { name: /hottest zone this month/ }).click();
      await expect(page.getByTestId('zone-card')).toBeVisible();
      await settle(page, 1000);
      await shot(page, `07-plan-today-focus-zone-${tag}`);

      await openApp(page, '/', 'demo-sam');
      await planReady(page);
      await settle(page, 1500);
      await shot(page, `08-plan-view-as-reporter-${tag}`);

      await openApp(page, '/?view=list');
      await expect(page.getByTestId('report-list')).toBeVisible();
      await settle(page, 400);
      await shot(page, `09-reports-list-${tag}`);

      await openApp(page, '/report', 'demo-sam');
      await tapPlan(page, 26, 20);
      await page.getByRole('radio', { name: 'Vehicles' }).click();
      await page.getByRole('radio', { name: 'High' }).click();
      await page.getByLabel('What happened').fill('Forklift reversed past the crossing while I was on it.');
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(page, 600);
      await shot(page, `10-report-form-${tag}`);
      if (mobile) await shot(page, `10b-report-form-full-${tag}`, true);
      await page.getByRole('switch', { name: 'Report anonymously' }).click();
      await page.getByRole('button', { name: 'Send report' }).click();
      await expect(page.getByTestId('report-sent')).toBeVisible();
      await settle(page, 900);
      await shot(page, `11-report-sent-${tag}`);

      await openApp(page, '/?view=list', 'demo-priya');
      await page.getByRole('link', { name: /dock leveller lip dropped/ }).click();
      await expect(page.getByRole('heading', { name: 'Triage desk' })).toBeVisible();
      await settle(page, 600);
      await shot(page, `12-report-triage-desk-${tag}`);
      await page.getByRole('button', { name: 'Mark triaged' }).click();
      await page.getByRole('button', { name: 'Mark fixed' }).click();
      await expect(page.getByTestId('status-error')).toBeVisible();
      await page.getByTestId('status-buttons').scrollIntoViewIfNeeded();
      await settle(page, 400);
      await shot(page, `13-report-serious-needs-action-${tag}`);

      await openApp(page, '/fixes');
      await page.getByRole('radio', { name: 'Everyone' }).click();
      await settle(page, 600);
      await shot(page, `14-fix-list-${tag}`);

      await openApp(page, '/toolbox');
      await expect(page.getByTestId('toolbox-sheet')).toBeVisible();
      await settle(page, 600);
      await shot(page, `15-toolbox-talk-${tag}`);
      await shot(page, `15b-toolbox-talk-full-${tag}`, true);
      if (theme === 'light') {
        await page.emulateMedia({ media: 'print', colorScheme: 'light' });
        await page.screenshot({ path: `${OUT}/15c-toolbox-talk-print-${size.tag}.png`, fullPage: true });
        await page.emulateMedia({ media: 'screen', colorScheme: theme });
      }

      await openApp(page, '/indicators');
      await expect(page.getByTestId('indicator-charts')).toBeVisible({ timeout: 20_000 });
      await settle(page, 1200);
      await shot(page, `16-lead-indicators-${tag}`);

      await openApp(page, '/about');
      await settle(page, 400);
      await shot(page, `17-about-${tag}`);

      await page.goto('/?nowebgl#/');
      await planReady(page);
      await settle(page, 1500);
      await shot(page, `18-plan-nowebgl-${tag}`);
    });
  }
}
