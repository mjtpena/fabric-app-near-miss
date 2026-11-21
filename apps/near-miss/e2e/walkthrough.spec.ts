/**
 * Dry run of demo/walkthrough.ts without narration or video, so every locator the recorder uses is proven to resolve.
 * Desktop only (the recording runs at 1920×1080).
 */
import { expect, test, type Locator } from '@playwright/test';

import type { DemoHelpers } from '@x10/shared/demo';

import { script } from '../demo/walkthrough';

test('the walkthrough runs end to end', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Recorded on desktop only.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  let first = true;
  const loc = (t: Locator | string) => (typeof t === 'string' ? page.getByText(t).first() : t);
  const h: DemoHelpers = {
    page,
    async goto(path, persona) {
      const q = persona ? `?as=${encodeURIComponent(persona)}` : '';
      if (first) {
        await page.goto(`/${q}#${path}`);
        first = false;
      } else await page.goto(`/${q}#${path}`);
      await expect(page.getByTestId('demo-banner')).toBeVisible();
    },
    async click(t) {
      await loc(t).click();
    },
    async type(t, text) {
      await loc(t).fill(text);
    },
    async fill(t, text) {
      await loc(t).fill(text);
    },
    async select(t, label) {
      await loc(t).selectOption({ label });
    },
    async hover(t) {
      await loc(t).hover();
    },
    async scrollTo(t) {
      await loc(t).scrollIntoViewIfNeeded();
    },
    async spotlight(t) {
      await expect(loc(t)).toBeVisible();
    },
    async pause() {
      await page.waitForTimeout(150);
    },
  };
  let lines = 0;
  for (const scene of script.scenes) {
    lines += scene.say.length;
    await test.step(scene.id, () => scene.run(h));
  }
  expect(script.scenes.length).toBeGreaterThanOrEqual(6);
  expect(lines).toBeGreaterThanOrEqual(14);
  expect(lines).toBeLessThanOrEqual(19);
});
