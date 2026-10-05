import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => (window as any).axe.run(document, { resultTypes: ['violations'] }));
  return (res.violations as { id: string; impact: string; nodes: unknown[] }[]).filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  (page as any).__errors = errors;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome', level: 1, exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((page as any).__errors).toEqual([]);
});

test('UI-20: every command is in the palette and runs from the keyboard', async ({ page }) => {
  await page.keyboard.press('Control+Shift+P');
  const list = page.getByRole('listbox', { name: 'Commands' });
  await expect(list).toBeVisible();
  expect(await list.getByRole('option').count()).toBeGreaterThanOrEqual(24);
  await page.keyboard.type('library');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Libraries', level: 1, exact: true })).toBeVisible();
});

test('UI-01/02/03 + PERF-10: keyboard-only selection cross-highlights every view', async ({ page }) => {
  await page.keyboard.press('Control+1');
  const tree = page.getByRole('tree', { name: 'Project navigator' });
  await expect(tree).toBeVisible();
  // project → Requirements group → R1, R2, R3
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: /^R3 / })).toBeVisible();
  const trace = page.getByRole('region', { name: 'Trace view' });
  await expect(trace.getByRole('button', { name: 'BLK-CMP' })).toHaveClass(/is-related/);
  await expect(trace.getByRole('button', { name: 'T-U-equal' })).toHaveClass(/is-related/);
  await expect(trace.getByRole('button', { name: 'src/cmp.cpp' })).not.toHaveClass(/is-related/);
  await expect(page.locator('.tree-item.is-related', { hasText: 'BLK-CMP' })).toBeVisible();
  const status = page.getByRole('status', { name: 'Status bar' });
  await expect(status).toContainText(/last \d+ ms/);
  const ms = Number((await status.textContent())!.match(/last (\d+) ms/)![1]);
  expect(ms).toBeLessThanOrEqual(200);
  // UI-03: navigate to a related artefact
  await page.getByRole('region', { name: 'Artefact details' }).getByRole('button', { name: /BLK-CMP|A = B comparator/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'A = B comparator' })).toBeVisible();
});

test('F0-24(a): transitive highlighting on request', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('transitive').check();
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('region', { name: 'Trace view' }).getByRole('button', { name: 'R3' }).click();
  await expect(page.getByRole('region', { name: 'Trace view' }).getByRole('button', { name: 'src/cmp.cpp' })).toHaveClass(/is-related/);
});

test('UI-21/22: theme, font scaling and undo', async ({ page }) => {
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.keyboard.press('Control+Shift+L');
  await expect(html).not.toHaveAttribute('data-theme', before!);
  for (let i = 0; i < 15; i++) await page.keyboard.press('Control+=');
  await expect.poll(() => html.evaluate((e) => getComputedStyle(e).getPropertyValue('--font-scale').trim())).toBe('2');
  await page.keyboard.press('Control+Z');
  await expect.poll(() => html.evaluate((e) => getComputedStyle(e).getPropertyValue('--font-scale').trim())).toBe('1.9');
  await page.keyboard.press('Control+Y');
  await expect.poll(() => html.evaluate((e) => getComputedStyle(e).getPropertyValue('--font-scale').trim())).toBe('2');
  for (let i = 0; i < 20; i++) await page.keyboard.press('Control+-');
  await expect.poll(() => html.evaluate((e) => getComputedStyle(e).getPropertyValue('--font-scale').trim())).toBe('0.8');
});

test('HOST-02(e): 1366×768 at 200 % keeps every function reachable without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  for (let i = 0; i < 10; i++) await page.keyboard.press('Control+=');
  await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('Compact layout');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['Welcome', 'Project', 'Libraries', 'Documentation', 'Self-diagnosis', 'Host check', 'Settings', 'Navigator', 'Help'])
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});

test('UI-17: library search and filters', async ({ page }) => {
  await page.keyboard.press('Control+L');
  await page.getByRole('tab', { name: /Component models/ }).click();
  await expect(page.getByText('Seed data from Phase 0 — not yet qualified')).toBeVisible();
  await page.getByLabel('Search library').fill('BMP280');
  await expect(page.locator('tbody tr').first()).toContainText('BMP280');
  await page.getByLabel('Search library').fill('');
  await page.getByLabel('interface').selectOption('I²C');
  const n = await page.locator('tbody tr').count();
  expect(n).toBeGreaterThan(5);
  for (const row of await page.locator('tbody tr td:nth-child(2)').allTextContents()) expect(row).toBe('I²C');
});

test('SS-07 + UI-23: searchable docs and context help', async ({ page }) => {
  await page.getByRole('button', { name: 'Documentation', exact: true }).click();
  await page.getByLabel('Search documentation').fill('baseline');
  await page.getByRole('list', { name: 'Search results' }).getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: /Versions, baselines/ })).toBeVisible();
  await page.getByRole('button', { name: 'Self-diagnosis', exact: true }).click();
  await page.keyboard.press('F1');
  await expect(page.getByRole('complementary', { name: 'Context help' })).toContainText('Self-diagnosis and integrity');
});

test('DIAG-01 view never claims checks it did not run', async ({ page }) => {
  await page.keyboard.press('Control+Shift+D');
  const arts = page.locator('article.diag');
  await expect(arts).toHaveCount(6);
  await expect(arts.nth(3)).toContainText('Increment 3');
});

for (const theme of ['light', 'dark']) {
  test.describe(() => { test.use({ bypassCSP: true });
  test(`accessibility (axe): no serious or critical violations, ${theme} theme`, async ({ page }) => {
    if (theme === 'dark') await page.keyboard.press('Control+Shift+L');
    const views = ['Welcome', 'Project', 'Libraries', 'Documentation', 'Self-diagnosis', 'Host check', 'Settings'];
    for (const v of views) {
      await page.getByRole('button', { name: v, exact: true }).click();
      await page.waitForTimeout(100);
      const bad = await axe(page);
      expect(bad.map((b) => `${v}: ${b.id}`)).toEqual([]);
    }
  });
  });
}

test.describe(() => { test.use({ bypassCSP: true });
test('SS-08 + HOST-04: start-up banner reports offline repair and stays accessible', async ({ page }) => {
  await page.goto('/?preview-startup=repaired');
  const banner = page.getByRole('alert', { name: 'Start-up checks' });
  await expect(banner).toContainText('restored from the local recovery store');
  await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('Integrity: OK (3 components)');
  expect(await axe(page)).toEqual([]);
  await banner.getByRole('button', { name: 'Open self-diagnosis' }).click();
  await expect(page.getByRole('heading', { name: 'Self-diagnosis', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toHaveCount(0);

  await page.goto('/?preview-startup=unrecoverable');
  await expect(page.getByRole('alert', { name: 'Start-up checks' })).toContainText('embedforge-setup repair');
  await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('1 not restored');
  // the default preview has no banner: nothing was repaired and the host has no shortfall
  await page.goto('/');
  await expect(page.getByRole('alert', { name: 'Start-up checks' })).toHaveCount(0);
});
});
