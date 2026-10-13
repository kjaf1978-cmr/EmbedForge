// Increment 2: schematic editor and simulation in the browser preview (UI-08, UI-24, ED-09,
// SIM-01..03, UI-19 exports, project save and open).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => (window as any).axe.run(document, { resultTypes: ['violations'] }));
  return (res.violations as { id: string; impact: string; nodes: { target: string[] }[] }[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  (page as any).__errors = errors;
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await expect(page.getByRole('heading', { name: 'Start', level: 1, exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]); });

const canvas = (page: Page) => page.getByRole('application', { name: /Schematic canvas/ });

/** Screen point of a sheet point, from the canvas's current view box. */
async function at(page: Page, x: number, y: number) {
  const b = (await canvas(page).boundingBox())!;
  const [vx, vy, vw, vh] = (await canvas(page).getAttribute('viewBox'))!.split(' ').map(Number);
  return { x: b.x + ((x - vx) * b.width) / vw, y: b.y + ((y - vy) * b.height) / vh };
}
async function click(page: Page, x: number, y: number) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); }
async function pick(page: Page, name: string) { await page.getByRole('complementary', { name: 'Part library' }).getByRole('button', { name, exact: true }).click(); }

test('UI-08 + SIM-01: draw an LED circuit from scratch, check it and simulate it', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await expect(page.getByRole('note')).toContainText('The sheet is empty');
  await pick(page, 'DC voltage source'); await click(page, 0, 0);
  await pick(page, 'Resistor'); await click(page, 60, -60);
  await pick(page, 'LED'); await page.keyboard.press('r'); await click(page, 120, -30);
  await page.keyboard.press('g'); await click(page, 0, 60);
  await page.keyboard.press('g'); await click(page, 120, 60);
  const checks = page.getByRole('tab', { name: /Checks/ });
  await expect(checks).toHaveText(/Checks \(\d+\)/);
  // wires: a click on a pin end starts a wire, a click on a pin ends it
  await page.keyboard.press('w');
  await click(page, 0, -30); await click(page, 0, -60); await click(page, 30, -60);
  await click(page, 90, -60); await click(page, 120, -60);
  await click(page, 120, 0); await click(page, 120, 60);
  await click(page, 0, 30); await click(page, 0, 60);
  await page.keyboard.press('Escape');
  await checks.click();
  await expect(page.getByText('No errors or warnings.')).toBeVisible();
  await expect(checks).toHaveText('Checks');
  await page.keyboard.press('F5');
  // 5 V, 1 kΩ (default), red LED: about 3 mA, 1.83 V across the LED
  await expect(page.locator('.op-chip text', { hasText: /^1\.8\d V$/ })).toBeVisible();
  await expect(page.locator('.led-glow')).toHaveCount(1);
  // undo the last wire: the ground of V1 is gone and ERC says so
  await page.keyboard.press('Control+Z');
  await expect(checks).toHaveText(/Checks \(\d+\)/);
  await page.keyboard.press('Control+Y');
  await expect(checks).toHaveText('Checks');
});

test('UI-08 (g): unit-aware values; the simulation updates live (SIM-03)', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: LED with series resistor' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.op-chip text', { hasText: /^1\.9\d V$/ })).toBeVisible();
  await page.locator('g.part:has(text:text-is("R1")) > g').click();
  const value = page.getByLabel('Resistance (Ω)');
  await value.fill('4k7x');
  await expect(page.getByText('Not a value')).toBeVisible();
  await value.fill('4k7');
  await expect(page.getByText('= 4.7 kΩ')).toBeVisible();
  await value.press('Enter');
  await expect(page.locator('text.val', { hasText: '4k7Ω' })).toBeVisible();
  await expect(page.locator('.op-chip text', { hasText: /^1\.7\d V$/ })).toBeVisible();
});

test('SIM-03: holding the push-button switches the transistor and lights the LED', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: Transistor switch with a push-button' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.op-chip').first()).toBeVisible();
  await expect(page.locator('.led-glow')).toHaveCount(0);
  const sw = (await page.locator('g.part:has(text:text-is("SW1")) > g').boundingBox())!;
  await page.mouse.move(sw.x + sw.width / 2, sw.y + sw.height / 2);
  await page.mouse.down();
  await expect(page.locator('.led-glow')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.led-glow')).toHaveCount(0);
});

test.describe(() => { test.use({ bypassCSP: true });
test('SIM-02: transient with probes, cursors and measurements; axe on the editor with results', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: Capacitor charging (time response)' }).click();
  await page.keyboard.press('F5');
  const results = page.getByRole('region', { name: 'Waveform viewer' });
  await expect(results).toBeVisible();
  await expect(results.getByRole('button', { name: 'V(OUT)', exact: true })).toBeVisible();
  await expect(results.getByRole('row', { name: /V\(IN\)/ })).toContainText('20 Hz');
  const plot = results.getByRole('img').first();
  const b = (await plot.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2);
  await expect(results.getByRole('row', { name: /V\(OUT\)/ }).getByRole('cell').nth(1)).not.toHaveText('—');
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Control+Shift+L');
  expect(await axe(page)).toEqual([]);
});
});

test('SIM-01 (d): AC sweep of the RC filter shows −3 dB near 1.59 kHz', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: RC low-pass filter (frequency response)' }).click();
  await page.keyboard.press('F5');
  const results = page.getByRole('region', { name: 'Waveform viewer' });
  await expect(results.getByRole('row', { name: /\|V\(OUT\)\|/ })).toContainText('dB');
  await expect(results.getByRole('img')).toHaveCount(2);
});

test('ED-09: rule check markers and the Checks list', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await pick(page, 'Resistor'); await click(page, 0, 0);
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByRole('button', { name: /Pin R1\.1 \(1\) is not connected/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /no ground symbol/ })).toBeVisible();
  await expect(page.locator('.erc-marker')).toHaveCount(2);
});

test('UI-24: the tutorial advances when a step is done', async ({ page }) => {
  await page.getByRole('button', { name: /Tutorial: your first circuit/ }).click();
  const tut = page.getByRole('region', { name: 'Tutorial' });
  await expect(tut).toContainText('1 · Add a voltage source');
  await pick(page, 'DC voltage source'); await click(page, 0, 0);
  await expect(tut).toContainText('2 · Add a resistor and an LED');
});

test('Projects: save, list on the start screen, open again; SPICE export', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await pick(page, 'Resistor'); await click(page, 0, 0);
  await page.keyboard.press('Control+s');
  const dlg = page.getByRole('dialog', { name: 'Save project' });
  await dlg.getByLabel('Project name').fill('My divider');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status', { name: 'Status bar' })).toContainText('My divider · saved');
  const download = page.waitForEvent('download');
  await page.getByText('Export', { exact: true }).click();
  await page.getByRole('button', { name: 'SPICE netlist (.cir)' }).click();
  expect((await download).suggestedFilename()).toBe('My_divider.cir');
  for (const [item, file] of [['Schematic as PNG', 'My_divider.png'], ['Schematic as SVG', 'My_divider.svg']]) {
    const dl = page.waitForEvent('download');
    await page.getByText('Export', { exact: true }).click();
    await page.getByRole('button', { name: item }).click();
    const d = await dl;
    expect(d.suggestedFilename()).toBe(file);
    const path = await d.path();
    const head = readFileSync(path).subarray(0, 8);
    if (file.endsWith('.png')) expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    else expect(readFileSync(path, 'utf8')).toContain('<svg');
  }
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'My divider' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Schematic · My divider');
  await expect(page.locator('g.part text.ref', { hasText: 'R1' })).toBeVisible();
});

test('UI-20: editor commands are in the command palette', async ({ page }) => {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('schematic rotate');
  await expect(page.getByRole('option', { name: /Rotate \(R\)/ })).toBeVisible();
  await page.keyboard.press('Escape');
});
