// Increment 1 usability scenarios (section 22 step 4): one beginner scenario (guided mode,
// mouse, laptop screen) and one expert scenario (keyboard only, full HD). Each step is timed;
// the timings are written to test-results/usability.json for the WP 1.4 report. These scripted
// runs give the builder's dry-run times and catch broken steps. The scenario with a person
// is user-executed (docs/inc1/usability.md).
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

type Step = { id: string; task: string; ms: number };
const results: Record<string, Step[]> = {};

async function step(page: Page, scenario: string, id: string, task: string, body: () => Promise<void>) {
  const t0 = Date.now();
  await test.step(`${id} ${task}`, body);
  (results[scenario] ??= []).push({ id, task, ms: Date.now() - t0 });
  void page;
}

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/usability.json', JSON.stringify(results, null, 2) + '\n');
});

test('beginner scenario: guided mode, mouse only, 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  const S = 'beginner';
  await step(page, S, 'B1', 'Switch to guided mode in Settings', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel(/guided/).check();
    await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('Guided mode');
  });
  await step(page, S, 'B2', 'Make the text larger (Settings → Font size)', async () => {
    const slider = page.getByLabel(/Font size/);
    await slider.fill('1.3');
    await expect.poll(() => page.locator('html').evaluate((e) => getComputedStyle(e).getPropertyValue('--font-scale').trim())).toBe('1.3');
  });
  await step(page, S, 'B3', 'Find out how to repair the installation (Documentation search)', async () => {
    await page.getByRole('button', { name: 'Documentation', exact: true }).click();
    await page.getByLabel('Search documentation').fill('repair');
    await page.getByRole('list', { name: 'Search results' }).getByRole('button', { name: /Installation, updates and repair/ }).click();
    await expect(page.getByRole('heading', { name: 'Installation, updates and repair' })).toBeVisible();
  });
  await step(page, S, 'B4', 'Open requirement R3 of the sample and see what it is linked to', async () => {
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.getByRole('tree', { name: 'Project navigator' }).getByText(/^R3 /).click();
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^R3 / })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Trace view' }).getByRole('button', { name: 'BLK-CMP' })).toHaveClass(/is-related/);
  });
  await step(page, S, 'B5', 'Look up the DHT22 sensor (ACC-01) in the libraries', async () => {
    await page.getByRole('button', { name: 'Libraries', exact: true }).click();
    await page.getByRole('tab', { name: /Component models/ }).click();
    await page.getByLabel('Search library').fill('DHT22');
    // finding U-1: the Increment 1 model seed comes from the kit inventory (DHT11 only); the
    // browser points to the libraries that do match
    await expect(page.getByText('0 shown')).toBeVisible();
    await page.getByRole('status', { name: 'Matches in other libraries' }).getByRole('button', { name: /Datasheets \(1\)/ }).click();
    await expect(page.locator('tbody tr').first()).toContainText('DHT22');
  });
  await step(page, S, 'B6', 'Check that the computer and the installation are fine', async () => {
    await page.getByRole('button', { name: 'Self-diagnosis', exact: true }).click();
    await expect(page.locator('article.diag')).toHaveCount(6);
    await page.getByRole('button', { name: 'Host check', exact: true }).click();
    await expect(page.getByText(/Profile/)).toBeVisible();
  });
});

test('expert scenario: keyboard only, 1920×1080', async ({ page }) => {
  await page.goto('/');
  const S = 'expert';
  const kb = page.keyboard;
  await step(page, S, 'E1', 'Palette → libraries → I²C component models', async () => {
    await kb.press('Control+Shift+P');
    await kb.type('library');
    await kb.press('Enter');
    await page.getByRole('tab', { name: /Component models/ }).focus();
    await kb.press('Enter');
    await page.getByLabel('interface').focus();
    await page.getByLabel('interface').selectOption('I²C');
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(5);
  });
  await step(page, S, 'E2', 'Navigator (Ctrl+1) → R3 → cross-highlight', async () => {
    await kb.press('Control+1');
    await kb.press('Home');
    // project → Requirements → R1 → R2 → R3; focus moves one frame after each key
    const active = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id ?? '');
    for (const id of ['requirements', 'req:R1', 'req:R2', 'req:R3']) {
      await kb.press('ArrowDown');
      await expect.poll(active).toBe(id);
    }
    await kb.press('Enter');
    await expect(page.locator('.tree-item.is-related', { hasText: 'BLK-CMP' })).toBeVisible();
  });
  await step(page, S, 'E3', 'Transitive highlighting from the palette, then undo it', async () => {
    await kb.press('Control+Shift+P');
    await kb.type('transitive');
    await kb.press('Enter');
    await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('Highlight: transitive');
    await kb.press('Control+Z');
    await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('Highlight: direct');
  });
  await step(page, S, 'E4', 'Dark theme, self-diagnosis, context help (F1)', async () => {
    await kb.press('Control+Shift+L');
    await kb.press('Control+Shift+D');
    await kb.press('F1');
    await expect(page.getByRole('complementary', { name: 'Context help' })).toContainText('Self-diagnosis and integrity');
  });
});
