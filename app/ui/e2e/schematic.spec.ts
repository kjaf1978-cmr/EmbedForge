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

async function chips(page: Page) { return (await page.locator('.op-chip text').allTextContents()).join(' '); }
async function dragRange(page: Page, input: ReturnType<Page['getByLabel']>, to: number, check?: () => Promise<void>) {
  const b = (await input.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to, b.y + b.height / 2, { steps: 8 });
  if (check) await check();
  await page.mouse.up();
}

test('SIM-03: the potentiometer sliders follow the drag and keep the value (properties and Controls)', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: LED dimmer with a potentiometer' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.op-chip').first()).toBeVisible();
  const before = await chips(page);
  await page.locator('g.part:has(text:text-is("RV1")) > g').first().click();
  const slider = page.getByLabel(/^Wiper position/);
  await expect(slider).toHaveValue('50');
  // while dragging, the thumb stays where the mouse is (the live preview must not pull it back)
  await dragRange(page, slider, 0.98, async () => { expect(Number(await slider.inputValue())).toBeGreaterThan(90); });
  await expect(slider).not.toHaveValue('50');
  const high = Number(await slider.inputValue());
  expect(high).toBeGreaterThan(90);
  await expect(page.locator('g.part:has(text:text-is("RV1"))')).toBeVisible();
  await expect.poll(() => chips(page)).not.toBe(before);
  // undo restores 50 %
  await page.keyboard.press('Control+z');
  await expect(slider).toHaveValue('50');
  // keyboard: End goes to 100 %
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100');
  await expect(page.getByText('Wiper position: 100 %')).toBeVisible();
  // the Controls slider in the Simulation tab
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const ctl = page.getByLabel(/^RV1 wiper/);
  await expect(ctl).toHaveValue('100');
  await dragRange(page, ctl, 0.02, async () => { expect(Number(await ctl.inputValue())).toBeLessThan(10); });
  expect(Number(await ctl.inputValue())).toBeLessThan(10);
  await page.getByRole('tab', { name: /Properties/ }).click();
  expect(Number(await page.getByLabel(/^Wiper position/).inputValue())).toBeLessThan(10);
});

test('rotate with Ctrl+R and Shift+R; the view toolkit pans, zooms and fits', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await pick(page, 'Resistor'); await click(page, 0, 0);
  await page.keyboard.press('Escape');
  await page.locator('g.part:has(text:text-is("R1")) > g').first().click();
  const tf = () => page.locator('g.part:has(text:text-is("R1")) > g[transform]').first().getAttribute('transform');
  const t0 = await tf();
  await page.keyboard.press('Control+r');
  await expect.poll(tf).not.toBe(t0);
  expect(await page.title()).toBeTruthy(); // the page did not reload
  await expect(page.locator('g.part:has(text:text-is("R1"))')).toBeVisible();
  await page.keyboard.press('Shift+R');
  await expect.poll(tf).toBe(t0);
  // Ctrl+R also works with the focus in the properties panel
  await page.getByLabel('Resistance (Ω)').focus();
  await page.keyboard.press('Control+r');
  await expect.poll(tf).not.toBe(t0);
  await page.getByRole('button', { name: 'Rotate left ⇧R', exact: true }).click();
  await expect.poll(tf).toBe(t0);
  await page.getByRole('button', { name: 'Flip Y', exact: true }).click();
  await expect.poll(tf).not.toBe(t0);
  await page.getByRole('button', { name: 'Flip Y', exact: true }).click();
  await expect.poll(tf).toBe(t0);

  const kit = page.getByRole('toolbar', { name: 'View' });
  const vb = () => canvas(page).getAttribute('viewBox');
  let v = await vb();
  await kit.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(vb).not.toBe(v); v = await vb();
  await kit.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(vb).not.toBe(v); v = await vb();
  // pan tool: a left drag moves the view and does not move the part
  await kit.getByRole('button', { name: 'Pan tool' }).click();
  await expect(kit.getByRole('button', { name: 'Pan tool' })).toHaveAttribute('aria-pressed', 'true');
  const b = (await canvas(page).boundingBox())!;
  await page.mouse.move(b.x + 200, b.y + 200); await page.mouse.down(); await page.mouse.move(b.x + 300, b.y + 260, { steps: 4 }); await page.mouse.up();
  await expect.poll(vb).not.toBe(v); v = await vb();
  expect(await tf()).toBe(t0);
  // Shift+wheel pans sideways
  await page.mouse.move(b.x + 300, b.y + 300);
  await page.keyboard.down('Shift'); await page.mouse.wheel(0, 120); await page.keyboard.up('Shift');
  await expect.poll(vb).not.toBe(v); v = await vb();
  // zoom area: Z, then drag a box
  await canvas(page).focus();
  await page.keyboard.press('z');
  const p1 = await at(page, -40, -20), p2 = await at(page, 40, 20);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
  await expect.poll(vb).not.toBe(v);
  const [, , w] = (await vb())!.split(' ').map(Number);
  expect(w).toBeLessThan(200);
  await kit.getByRole('button', { name: 'Zoom to fit' }).click();
  await page.keyboard.press('1');
  await expect(page.locator('.sch-status')).toContainText('zoom 100 %');
});

test('every part: place it, change every property, simulate; every analysis and every menu item', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole('button', { name: /New schematic/ }).click();
  const lib = page.getByRole('complementary', { name: 'Part library' });
  const names = (await lib.locator('button.lib-item span').allTextContents()).map((t) => t.trim());
  expect(names.length).toBeGreaterThanOrEqual(26);
  const kit = page.getByRole('toolbar', { name: 'View' });
  for (let z = 0; z < 5; z++) await kit.getByRole('button', { name: 'Zoom out' }).click();
  for (const [k, name] of names.entries()) {
    await pick(page, name);
    await click(page, (k % 7 - 3) * 160, (Math.floor(k / 7) - 1.5) * 160);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('g.part')).toHaveCount(names.length);
  const side = page.getByRole('complementary', { name: 'Properties and simulation' });
  for (let k = 0; k < names.length; k++) {
    await canvas(page).focus();
    await page.keyboard.press('Tab');
    const insp = side.locator('.inspector');
    await expect(insp.locator('h3')).toBeVisible();
    const fields = insp.locator('.field input, .field select');
    const n = await fields.count();

    for (let f = 0; f < n; f++) {
      const el = fields.nth(f);
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      const type = (await el.getAttribute('type')) ?? '';
      if ((await el.getAttribute('id'))?.startsWith('ref-')) {
        // a reference already in use is refused, and the field says so
        await el.fill('R1'); await el.press('Enter');
        if (!(await insp.locator('h3').innerText()).startsWith('Resistor')) await expect(insp.getByText('R1 is already used')).toBeVisible();
        continue;
      }
      if (tag === 'select') {
        const opts = await el.locator('option').allTextContents();
        await el.selectOption({ index: opts.length - 1 });
      } else if (type === 'checkbox') await el.click();
      else if (type === 'range') { await el.focus(); await page.keyboard.press('End'); await expect(el).toHaveValue('100'); }
      else {
        const v = await el.inputValue();
        // net and rail names stay names; every other field takes a value
        const next = /^(GND|[+-]\d)/i.test(v) ? (v === 'GND' ? 'GND' : '+12V') : '2';
        await el.fill(next); await el.press('Enter');
        await expect(insp.getByText('Not a value')).toHaveCount(0);
      }
    }
  }
  // the ground is still unconnected: the message says so; then wire it to V1−
  await page.keyboard.press('F5');
  await expect(side.getByText(/ground symbol is not connected/).first()).toBeVisible();
  const gi = names.indexOf('Ground'), vi = names.indexOf('DC voltage source');
  const pos = (k: number) => ({ x: (k % 7 - 3) * 160, y: (Math.floor(k / 7) - 1.5) * 160 });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await canvas(page).focus(); await page.keyboard.press('w');
  await click(page, pos(gi).x, pos(gi).y);
  await click(page, pos(vi).x, pos(vi).y + 30);
  const ask = page.getByRole('alertdialog');
  if (await ask.isVisible()) await ask.getByRole('button', { name: /Route around|Connect them/ }).first().click();
  await page.keyboard.press('Escape');
  // every analysis on the full sheet: each one finishes without an error
  await side.getByRole('tab', { name: 'Simulation' }).click();
  for (const a of ['Operating point', 'Transient', 'AC sweep', 'DC sweep']) {
    await side.getByRole('radio', { name: new RegExp(a) }).check();
    await page.keyboard.press('F5');
    await expect(page.getByRole('button', { name: /Simulat/ }).first()).not.toHaveText(/…/, { timeout: 20_000 });
    await expect(side.locator('.sim-panel')).toContainText(/Simulated in/);
  }
  for (const tab of [/Checks/, 'Netlist', /Properties/]) await side.getByRole('tab', { name: tab }).click();
  // toolbar items that act on the selection, then on the whole sheet
  await canvas(page).focus(); await page.keyboard.press('Tab');
  for (const b of ['Rotate R', 'Rotate left ⇧R', 'Mirror X', 'Flip Y', 'Rotate selection clockwise', 'Rotate selection counter-clockwise']) await page.getByRole('button', { name: b, exact: true }).click();
  await page.getByRole('button', { name: 'Fit selection' }).click();
  await page.getByRole('button', { name: 'Annotate' }).click();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  // every Layout menu item
  const layout = page.locator('details.menu', { hasText: 'Layout' });
  const items = await layout.locator('.menu-list button').count();
  for (let k = 0; k < items; k++) {
    await layout.locator('summary').click();
    await layout.locator('.menu-list button').nth(k).click();
  }
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('g.part')).toHaveCount(names.length - 1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('g.part')).toHaveCount(names.length);
});

test('SIM-03: dragging the wiper on the sheet moves it and re-simulates', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: LED dimmer with a potentiometer' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.op-chip').first()).toBeVisible();
  const before = await chips(page);
  // RV1 sits at (0, -30), turned once: its track runs from (0, -60) (0 %) to (0, 0) (100 %)
  const a = await at(page, 14, -30), b = await at(page, 14, -6);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => chips(page)).not.toBe(before);
  await click(page, 0, -30); // the body of RV1
  expect(Number(await page.getByLabel(/^Wiper position/).inputValue())).toBeGreaterThan(70);
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

test('parameter sweep (.step): one trace per value of C1, saved with the sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: RC low-pass filter (frequency response)' }).click();
  const side = page.getByRole('complementary', { name: 'Properties and simulation' });
  await side.getByRole('tab', { name: 'Simulation' }).click();
  await side.getByLabel('Run the analysis once per value of a part property').check();
  await side.getByLabel('Stepped property').selectOption({ label: 'C1 capacitance' });
  await expect(side.getByLabel('Values (separated by spaces)')).toHaveValue('50n 100n 200n');
  await expect(side.getByText(/3 runs: 50n, 100n, 200n F/)).toBeVisible();
  await page.keyboard.press('F5');
  const results = page.getByRole('region', { name: 'Waveform viewer' });
  for (const c of ['50n', '100n', '200n']) await expect(results.getByRole('row', { name: new RegExp(`\\|V\\(OUT\\)\\| · C1 = ${c}`) })).toBeVisible();
  // undo turns the sweep off again, step by step
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  await expect(side.getByLabel('Run the analysis once per value of a part property')).not.toBeChecked();
});

test('FFT view: the spectrum of the amplifier output, with its THD', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: Non-inverting op-amp amplifier' }).click();
  await page.keyboard.press('F5');
  const results = page.getByRole('region', { name: 'Waveform viewer' });
  await results.getByRole('button', { name: 'FFT', exact: true }).click();
  const spec = results.getByRole('region', { name: 'Spectrum' });
  await expect(spec.getByRole('img').first()).toBeVisible();
  await expect(spec.getByText(/V\(OUT\): strongest component .* at 1 kHz, THD/)).toBeVisible();
  await results.getByRole('button', { name: 'FFT', exact: true }).click();
  await expect(spec).toHaveCount(0);
});

test('text notes (T) and the parts list (BOM)', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: LED with series resistor' }).click();
  await canvas(page).focus();
  await page.keyboard.press('t');
  await click(page, 0, -80);
  const text = page.getByLabel('Text', { exact: true });
  await expect(text).toBeFocused();
  await text.fill('Use a 0.25 W resistor'); await text.press('Enter');
  await expect(page.locator('text.note-text', { hasText: 'Use a 0.25 W resistor' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Checks', exact: true })).toBeVisible(); // still no rule-check findings
  const side = page.getByRole('complementary', { name: 'Properties and simulation' });
  await side.getByRole('tab', { name: 'Parts' }).click();
  await expect(side.getByRole('row', { name: /1 R1 Resistor 330 Ω/ })).toBeVisible();
  const dl = page.waitForEvent('download');
  await side.getByRole('button', { name: 'Export CSV' }).click();
  expect((await dl).suggestedFilename()).toMatch(/-bom\.csv$/);
  await side.getByRole('button', { name: 'R1', exact: true }).click();
  await expect(side.getByRole('heading', { name: 'Resistor' })).toBeVisible();
});

test('SPICE model import: paste a .model card into a diode', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: Half-wave rectifier with smoothing' }).click();
  await click(page, 60, -60); // D1
  const box = page.getByLabel('SPICE model (optional)');
  await box.fill('.model 1N4001 D(IS=29.5n RS=73.6m N=1.98 CJO=17p BV=50)');
  await box.blur();
  await expect(page.getByText(/Uses 1N4001 \(IS, RS, N, BV\); ignored: CJO/)).toBeVisible();
  await box.fill('.model X NPN(IS=1e-14)'); await box.blur();
  await expect(page.getByText(/Not used: a NPN model does not fit/)).toBeVisible();
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
  await expect(page.getByRole('option', { name: /Rotate clockwise \(R \/ Ctrl\+R\)/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('collisions: a wire through pins asks first — connect, route around or cancel', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await pick(page, 'Resistor'); await click(page, 50, 0);           // pins at (20,0) and (80,0)
  const dlg = page.getByRole('alertdialog');
  // cancel: nothing is drawn
  await page.keyboard.press('w'); await click(page, 0, 0); await click(page, 100, 0);
  await expect(dlg).toContainText('passes through R1.1, R1.2');
  await expect(dlg).toContainText('short-circuit R1');
  await dlg.getByRole('button', { name: 'Cancel this segment' }).click();
  await expect(page.locator('line.wire')).toHaveCount(0);
  // route around: the wire avoids both pins
  await click(page, 100, 0);
  await dlg.getByRole('button', { name: /Route around/ }).click();
  await expect(dlg).toHaveCount(0);
  expect(await page.locator('line.wire').count()).toBeGreaterThanOrEqual(3);
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByRole('button', { name: /Pin R1\.1 \(1\) is not connected/ })).toBeVisible();
  // connect, and remember it: the next collision is connected without asking
  await page.keyboard.press('Escape');
  await page.keyboard.press('w'); await click(page, 0, 40); await click(page, 30, 40);
  await page.keyboard.press('Escape');
  await page.keyboard.press('w'); await click(page, 10, 40); await click(page, 60, 40);   // runs along the wire just drawn
  await expect(dlg).toContainText('runs along');
  await dlg.getByLabel(/Do the same from now on/).check();
  await dlg.getByRole('button', { name: 'Connect them' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('w'); await click(page, 0, 0); await click(page, 100, 0);
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel(/always connect, without asking/)).toBeChecked();
});

test('collisions: moving a part onto a wire asks; cancel leaves it where it was', async ({ page }) => {
  await page.getByRole('button', { name: /New schematic/ }).click();
  await pick(page, 'Resistor'); await click(page, 50, 0);
  await page.keyboard.press('w'); await click(page, 0, 60); await click(page, 100, 60);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');   // end the wire, leave the wire tool
  const body = (await page.locator('g.part:has(text:text-is("R1")) > g').boundingBox())!;
  const to = await at(page, 50, 60);
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('Move: this would connect');
  await expect(dlg).toContainText('R1 pin 1 lands in the middle of a wire');
  await dlg.getByRole('button', { name: /Cancel/ }).click();
  await expect(page.locator('g.part:has(text:text-is("R1")) > g')).toHaveAttribute('transform', /translate\(50 0\)/);
});

test('layout: results beside or below, splitter, maximise, panels (LTspice-style tiling)', async ({ page }) => {
  await page.getByRole('button', { name: 'Open example: Capacitor charging (time response)' }).click();
  await page.keyboard.press('F5');
  const results = page.getByRole('region', { name: 'Waveform viewer' });
  const cv = canvas(page);
  await expect(results).toBeVisible();
  let a = (await cv.boundingBox())!, r = (await results.boundingBox())!;
  expect(r.y).toBeGreaterThan(a.y + a.height - 2);            // below
  await page.keyboard.press('Control+Alt+ArrowRight');
  a = (await cv.boundingBox())!; r = (await results.boundingBox())!;
  expect(r.x).toBeGreaterThan(a.x + a.width - 2);             // beside
  expect(Math.abs(r.y - a.y)).toBeLessThan(4);
  const sep = page.getByRole('separator', { name: /Resize the schematic and the results/ });
  await expect(sep).toHaveAttribute('aria-valuenow', '60');
  await sep.focus(); await page.keyboard.press('ArrowRight');
  await expect(sep).toHaveAttribute('aria-valuenow', '65');
  await page.keyboard.press('Control+Alt+w');                  // maximise the results
  await expect(cv).toHaveCount(0);
  await page.keyboard.press('Control+Alt+w');
  await expect(cv).toBeVisible();
  await page.getByText('Layout', { exact: true }).click();
  await page.getByRole('button', { name: /Part library panel/ }).click();
  await expect(page.getByRole('complementary', { name: 'Part library' })).toHaveCount(0);
  // the layout is kept when another document opens
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Open example: LED with series resistor' }).click();
  await expect(page.getByRole('complementary', { name: 'Part library' })).toHaveCount(0);
  await expect(results).toBeVisible();                        // beside: shown, waiting for waveforms
  await page.getByText('Layout', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset the layout' }).click();
  await expect(page.getByRole('complementary', { name: 'Part library' })).toBeVisible();
  await expect(results).toHaveCount(0);                       // below and nothing to show
});
