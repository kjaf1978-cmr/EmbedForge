import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/eda/examples';
import { erc } from '../src/eda/erc';
import { simulate, schematicSpice, type SimResult } from '../src/sim/run';
import { connectivity, netAt } from '../src/eda/connectivity';
import { addWire, copySelection, deleteSelection, hitTest, mirrorSelection, moveSelection, paste, placePart, rotateSelection, noSelection } from '../src/eda/editor';
import { emptySheet, pinPositions, type Sheet } from '../src/eda/schematic';
import { fromFiles, toFiles } from '../src/eda/project';
import { buildNetlist } from '../src/eda/netlist';

// the charger's 90 ms run takes minutes; its steady state is tested in charger*.test.ts, here the
// start-up (10 ms) is enough to show that it connects and simulates
const short = (s: Sheet, id: string): Sheet => (id.startsWith('inverter-') ? { ...s, sim: { ...s.sim, stop: '2m' } as Sheet['sim'] } : id === 'mppt-charger' ? { ...s, sim: { ...s.sim, stop: '10m' } as Sheet['sim'] } : id === 'stabiliser' ? { ...s, sim: { ...s.sim, stop: '1' } as Sheet['sim'] } : id.startsWith('changeover') ? { ...s, sim: { ...s.sim, stop: '0.5' } as Sheet['sim'] } : s);

describe('examples (UI-24)', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: connected, ERC clean, simulates`, () => {
      const s = short(ex.build(), ex.id);
      const issues = erc(s).filter((i) => i.severity !== 'info');
      expect(issues.map((i) => i.message)).toEqual([]);
      const r = simulate(s);
      expect('error' in r ? (r as { error: string }).error : '').toBe('');
      const res = r as SimResult;
      // every probe resolves to a net or a pin current
      const conn = connectivity(s);
      for (const p of s.probes) {
        if (p.kind === 'v') expect(netAt(s, conn, p.at), `${ex.id} probe at ${JSON.stringify(p.at)}`).not.toBeNull();
        if (p.kind === 'i') { const part = s.parts.find((q) => q.id === p.part)!; expect(res.i[`${part.ref}.${p.pin}`]).toBeDefined(); }
      }
      expect(schematicSpice(s)).toMatch(/\.end/);
    }, 120_000);
  }
  it('LED example: about 9 mA through the LED', () => {
    const s = EXAMPLES.find((e) => e.id === 'led')!.build();
    const r = simulate(s) as SimResult;
    expect(r.i['D1.2'][0]).toBeGreaterThan(0.008);
    expect(r.i['D1.2'][0]).toBeLessThan(0.0095);
  });
  it('transistor switch: LED off when released, on when pressed (SIM-03)', () => {
    const s = EXAMPLES.find((e) => e.id === 'transistor-switch')!.build();
    const off = simulate(s) as SimResult;
    expect(Math.abs(off.i['D1.2'][0])).toBeLessThan(1e-6);
    const sw = s.parts.find((p) => p.sym === 'button')!;
    sw.props.pressed = 'true';
    const t0 = performance.now();
    const on = simulate(s) as SimResult;
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(on.i['D1.2'][0]).toBeGreaterThan(0.005);
  });
  it('op-amp amplifier gain ≈ 5.5', () => {
    const s = EXAMPLES.find((e) => e.id === 'opamp-amp')!.build();
    const r = simulate(s) as SimResult;
    const out = r.v['OUT'], inn = r.v['IN'];
    expect(Math.max(...out) / Math.max(...inn)).toBeCloseTo(1 + 10 / 2.2, 1);
  });
});

describe('editing (UI-08 (b), (d))', () => {
  it('moving a part drags its wires along and keeps them orthogonal', () => {
    let s = emptySheet();
    const a = placePart(s, 'resistor', { x: 0, y: 0 }); s = a.sheet;
    const b = placePart(s, 'resistor', { x: 100, y: 0 }); s = b.sheet;
    s = addWire(s, [{ x: 30, y: 0 }, { x: 70, y: 0 }]);
    const before = buildNetlist(s).nets;
    s = moveSelection(s, { ...noSelection(), parts: [b.id] }, 0, 40);
    expect(s.wires.every((w) => w.a.x === w.b.x || w.a.y === w.b.y)).toBe(true);
    expect(buildNetlist(s).nets.map((n) => n.pins)).toEqual(before.map((n) => n.pins));
  });
  it('rotate, mirror, copy/paste and delete', () => {
    let s = emptySheet();
    const a = placePart(s, 'resistor', { x: 0, y: 0 }); s = a.sheet;
    s = rotateSelection(s, { ...noSelection(), parts: [a.id] });
    expect(s.parts[0].rot).toBe(1);
    expect(pinPositions(s.parts[0]).map((p) => p.at)).toEqual([{ x: 0, y: -30 }, { x: 0, y: 30 }]);
    s = mirrorSelection(s, { ...noSelection(), parts: [a.id] });
    expect(s.parts[0].mirror).toBe(true);
    const clip = copySelection(s, { ...noSelection(), parts: [a.id] });
    const p = paste(s, clip, 50, 0);
    expect(p.sheet.parts.map((x) => x.ref)).toEqual(['R1', 'R2']);
    s = deleteSelection(p.sheet, p.sel);
    expect(s.parts.length).toBe(1);
  });
  it('hit test finds pins before bodies and wires', () => {
    let s = emptySheet();
    s = placePart(s, 'resistor', { x: 0, y: 0 }).sheet;
    s = addWire(s, [{ x: 30, y: 0 }, { x: 80, y: 0 }]);
    expect(hitTest(s, { x: 30, y: 1 }, 4)?.kind).toBe('pin');
    expect(hitTest(s, { x: 60, y: 1 }, 4)?.kind).toBe('wire');
    expect(hitTest(s, { x: 0, y: 3 }, 4)?.kind).toBe('part');
    expect(hitTest(s, { x: 0, y: 60 }, 4)).toBeNull();
  });
  it('collinear wire segments drawn in steps are merged', () => {
    let s = emptySheet();
    s = addWire(s, [{ x: 0, y: 0 }, { x: 50, y: 0 }]);
    s = addWire(s, [{ x: 50, y: 0 }, { x: 100, y: 0 }]);
    expect(s.wires.length).toBe(1);
  });
});

describe('project files (DATA-01, INV-08)', () => {
  it('round trip keeps the netlist and geometry; host-free', () => {
    const s = EXAMPLES.find((e) => e.id === 'opamp-amp')!.build();
    const files = JSON.parse(JSON.stringify(toFiles('Amp', s)));
    expect(JSON.stringify(files)).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
    const back = fromFiles(files);
    expect(back.notes).toEqual([]);
    expect(buildNetlist(back.sheet)).toEqual(buildNetlist(s));
    expect(back.sheet.probes.length).toBe(s.probes.length);
    expect(back.sheet.sim).toEqual(s.sim);
  });
  it('a netlist that disagrees with the drawing is reported', () => {
    const s = EXAMPLES[0].build();
    const files = JSON.parse(JSON.stringify(toFiles('LED', s)));
    files['netlist.json'].nets[0].pins.pop();
    expect(fromFiles(files).notes.join(' ')).toMatch(/disagrees/);
  });
});

describe('555 timer and regulators', () => {
  it('555 astable: about 1 Hz, THR between 1/3 and 2/3 of VCC', () => {
    const s = EXAMPLES.find((e) => e.id === 'blinker555')!.build();
    const r = simulate(s) as SimResult;
    expect('error' in r).toBe(false);
    const thr = r.v['THR'], out = r.v['OUT'];
    // after the first cycle: thresholds at 3 V and 6 V (9 V supply)
    const late = r.x.map((t, i) => [t, thr[i]] as const).filter(([t]) => t > 1.2).map(([, v]) => v);
    expect(Math.min(...late)).toBeGreaterThan(2.85);
    expect(Math.max(...late)).toBeLessThan(6.15);
    // frequency from the rising edges of OUT
    const rises: number[] = [];
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 3.5 && out[i] >= 3.5) rises.push(r.x[i]);
    // the output starts high (the empty capacitor triggers the 555), so every rising edge
    // ends a full low phase: the period is the time between rising edges
    expect(out[0]).toBeGreaterThan(6);
    expect(rises.length).toBeGreaterThanOrEqual(2);
    const f = (rises.length - 1) / (rises[rises.length - 1] - rises[0]);
    const expected = 1.44 / ((10e3 + 2 * 68e3) * 10e-6);
    expect(Math.abs(f / expected - 1)).toBeLessThan(0.05);
  });
  it('7805: 5 V within 1 % above the dropout, follows the input below it', () => {
    const s = EXAMPLES.find((e) => e.id === 'regulator')!.build();
    const r = simulate(s) as SimResult;
    expect('error' in r).toBe(false);
    const at = (v: number) => r.v['OUT'][r.x.findIndex((x) => Math.abs(x - v) < 1e-6)];
    expect(at(9)).toBeGreaterThan(4.95); expect(at(9)).toBeLessThan(5.05);
    expect(at(12)).toBeGreaterThan(4.95); expect(at(12)).toBeLessThan(5.05);
    expect(at(5)).toBeLessThan(3.6);
    // input current ≈ load current + quiescent current
    const op = { ...s, sim: { type: 'op' as const } };
    const o = simulate(op) as SimResult;
    expect(-o.i['BT1.1'][0]).toBeGreaterThan(0.05);
    expect(-o.i['BT1.1'][0]).toBeLessThan(0.0575);
  });
});

describe('wire collisions are found, not merged silently', async () => {
  const { wireCollisions, routeAround, noCollision } = await import('../src/eda/editor');
  const base = () => {
    let s = emptySheet();
    s = placePart(s, 'resistor', { x: 50, y: 0 }).sheet;          // pins (20,0) and (80,0)
    s = addWire(s, [{ x: 0, y: 40 }, { x: 100, y: 40 }]);          // a horizontal wire at y = 40
    return s;
  };
  it('a wire passing through a pin or running along a wire collides', () => {
    const s = base();
    expect(noCollision(wireCollisions(s, [{ x: 0, y: 0 }, { x: 100, y: 0 }]))).toBe(false);   // through R1's pins
    const c = wireCollisions(s, [{ x: 20, y: 40 }, { x: 60, y: 40 }]);                           // along the wire
    expect(c.overlaps.length).toBe(1);
    expect(noCollision(wireCollisions(s, [{ x: 20, y: 0 }, { x: 20, y: 30 }]))).toBe(true);    // pin to free space
    expect(noCollision(wireCollisions(s, [{ x: 60, y: -20 }, { x: 60, y: 60 }]))).toBe(true);  // crossing only
  });
  it('ending on a pin or wire is intended, not a collision', () => {
    const s = base();
    expect(noCollision(wireCollisions(s, [{ x: 20, y: 0 }, { x: 20, y: 40 }]))).toBe(true);
  });
  it('route around finds a detour that touches nothing', () => {
    const s = base();
    const p = routeAround(s, { x: 0, y: 0 }, { x: 100, y: 0 })!;
    expect(p).not.toBeNull();
    expect(noCollision(wireCollisions(s, p))).toBe(true);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p[p.length - 1]).toEqual({ x: 100, y: 0 });
  });
});

describe('rotate both ways and mirror both ways', async () => {
  const { rotateSelectionCcw, mirrorSelectionV } = await import('../src/eda/editor');
  const { toLocal, toWorld } = await import('../src/eda/schematic');
  it('counter-clockwise undoes clockwise; vertical mirror flips pins top–bottom', () => {
    let s = emptySheet();
    const a = placePart(s, 'npn', { x: 0, y: 0 }); s = a.sheet;
    const sel = { ...noSelection(), parts: [a.id] };
    const pins0 = pinPositions(s.parts[0]).map((p) => p.at);
    const back = rotateSelectionCcw(rotateSelection(s, sel), sel);
    expect(pinPositions(back.parts[0]).map((p) => p.at)).toEqual(pins0);
    const v = mirrorSelectionV(s, sel);
    // C at top (10,-30) and E at bottom (10,30) swap places; B stays on the left
    expect(pinPositions(v.parts[0]).map((p) => p.at)).toEqual([{ x: -30, y: 0 }, { x: 10, y: 30 }, { x: 10, y: -30 }]);
  });
  it('toLocal inverts toWorld for every orientation', () => {
    for (const rot of [0, 1, 2, 3] as const) for (const mirror of [false, true]) {
      const p = { x: 40, y: -20, rot, mirror };
      expect(toLocal(p, toWorld(p, { x: 7, y: -13 }))).toEqual({ x: 7, y: -13 });
    }
  });
});
