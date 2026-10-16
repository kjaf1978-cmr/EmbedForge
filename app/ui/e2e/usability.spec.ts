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
    await page.getByRole('button', { name: 'Traceability', exact: true }).click();
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
    // project → Requirements → R1 → R2 → R3; focus moves one frame after each key (also after
    // Ctrl+1), so every key waits until the previous one has moved the focus
    const active = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id ?? '');
    await kb.press('Control+1');
    await expect.poll(active).not.toBe('');
    await kb.press('Home');
    await expect.poll(active).toBe('project');
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

// ---- Increment 2 usability scenarios: schematic entry and simulation (section 22 step 4)

async function sheetPoint(page: Page, x: number, y: number) {
  const cv = page.getByRole('application', { name: /Schematic canvas/ });
  const b = (await cv.boundingBox())!;
  const [vx, vy, vw, vh] = (await cv.getAttribute('viewBox'))!.split(' ').map(Number);
  return { x: b.x + ((x - vx) * b.width) / vw, y: b.y + ((y - vy) * b.height) / vh };
}

test('Increment 2 beginner scenario: the tutorial circuit with the mouse, 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  const S = 'inc2-beginner';
  const click = async (x: number, y: number) => { const p = await sheetPoint(page, x, y); await page.mouse.click(p.x, p.y); };
  const pick = (name: string) => page.getByRole('complementary', { name: 'Part library' }).getByRole('button', { name, exact: true }).click();
  const tut = page.getByRole('region', { name: 'Tutorial' });
  await step(page, S, 'S1', 'Start the tutorial from the start screen', async () => {
    await page.getByRole('button', { name: /Tutorial: your first circuit/ }).click();
    await expect(tut).toContainText('1 · Add a voltage source');
  });
  await step(page, S, 'S2', 'Place a DC source, a resistor, an LED (rotated) and ground', async () => {
    await pick('DC voltage source'); await click(0, 0);
    await pick('Resistor'); await click(60, -60);
    await pick('LED'); await page.keyboard.press('r'); await click(120, -30);
    await page.getByRole('toolbar', { name: 'Schematic tools' }).getByRole('button', { name: /^Ground/ }).click(); await click(0, 60);
    await page.getByRole('toolbar', { name: 'Schematic tools' }).getByRole('button', { name: /^Ground/ }).click(); await click(120, 60);
    await expect(tut).toContainText('4 · Wire it up');
  });
  await step(page, S, 'S3', 'Wire the circuit by clicking pin ends', async () => {
    await click(0, -30); await click(0, -60); await click(30, -60);
    await click(90, -60); await click(120, -60);
    await click(120, 0); await click(120, 60);
    await click(0, 30); await click(0, 60);
    await expect(tut).toContainText('5 · Simulate');
  });
  await step(page, S, 'S4', 'Simulate and see the LED light up', async () => {
    await page.getByRole('button', { name: /Simulate/ }).first().click();
    await expect(page.locator('.led-glow')).toHaveCount(1);
    await expect(tut).toContainText('6 · Change a value');
  });
  await step(page, S, 'S5', 'Change the resistor to 330 Ω and watch the result update', async () => {
    await page.locator('g.part:has(text:text-is("R1")) > g').click();
    await page.getByLabel('Resistance (Ω)').fill('330');
    await page.getByLabel('Resistance (Ω)').press('Enter');
    await expect(page.locator('.op-chip text', { hasText: /^1\.9\d V$/ })).toBeVisible();
    await expect(tut).toContainText('Well done');
  });
});

test('Increment 2 expert scenario: keyboard-only schematic entry and simulation, 1920×1080', async ({ page }) => {
  await page.goto('/');
  const S = 'inc2-expert';
  const kb = page.keyboard;
  const press = async (key: string, n = 1) => { for (let i = 0; i < n; i++) await kb.press(key); };
  await step(page, S, 'X1', 'New schematic from the command palette', async () => {
    await kb.press('Control+Shift+P'); await kb.type('new schematic'); await kb.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Schematic · Untitled/);
  });
  await step(page, S, 'X2', 'Place a source and a resistor with A, search, arrows and Enter', async () => {
    await page.getByRole('application', { name: /Schematic canvas/ }).focus();
    await kb.press('a'); await kb.type('dc voltage'); await kb.press('Enter'); await kb.press('Enter');
    await kb.press('a'); await kb.type('resistor'); await kb.press('Enter');
    await press('ArrowRight', 6); await press('ArrowUp', 6); await kb.press('Enter');
    await kb.press('g'); await press('ArrowLeft', 6); await press('ArrowDown', 12); await kb.press('Enter');
    await expect(page.locator('g.part text.ref', { hasText: 'R1' })).toBeVisible();
  });
  await step(page, S, 'X3', 'Wire with W, arrow keys and Enter', async () => {
    await kb.press('w');
    await press('ArrowUp', 9); await kb.press('Enter');       // V1 + (0,-30)
    await press('ArrowUp', 3); await kb.press('Enter');       // corner (0,-60)
    await press('ArrowRight', 3); await kb.press('Enter');    // R1.1 (30,-60): ends
    await press('ArrowRight', 6); await kb.press('Enter');    // R1.2 (90,-60)
    await press('ArrowDown', 12); await kb.press('Enter');    // (90,60)
    await press('ArrowLeft', 9); await kb.press('Enter');     // ground (0,60): ends
    await press('ArrowUp', 3); await kb.press('Enter');       // V1 − (0,30)
    await press('ArrowDown', 3); await kb.press('Enter');     // ground: ends
    await kb.press('Escape');
    await expect(page.getByRole('tab', { name: 'Checks', exact: true })).toBeVisible();
  });
  await step(page, S, 'X4', 'Simulate (F5) and read the current from the hover/inspector', async () => {
    await kb.press('F5');
    await expect(page.locator('.op-chip text', { hasText: /^5 V$/ })).toBeVisible();
    await kb.press('Tab');
    await expect(page.getByRole('complementary', { name: 'Properties and simulation' })).toContainText(/Current in/);
  });
  await step(page, S, 'X5', 'Switch to a DC sweep from the Simulation tab and run it', async () => {
    await page.getByRole('tab', { name: 'Simulation' }).click();
    await page.getByLabel(/DC sweep/).check();
    await kb.press('F5');
    await expect(page.getByRole('region', { name: 'Waveform viewer' })).toBeVisible();
  });
});
