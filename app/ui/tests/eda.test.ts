import { describe, expect, it } from 'vitest';
import { formatValue, nearestStandard, parseValue, spiceNumber } from '../src/eda/units';
import { emptySheet, defaultProps, nextRef, annotate, toWorld, type Part, type Sheet } from '../src/eda/schematic';
import { symbolOf, searchSymbols, railVoltage, SYMBOLS } from '../src/eda/symbols';
import { connectivity } from '../src/eda/connectivity';
import { buildNetlist, describeDiff, diffNetlist } from '../src/eda/netlist';
import { erc } from '../src/eda/erc';
import { simulate, schematicSpice, type SimResult } from '../src/sim/run';

let n = 0;
function part(sym: string, ref: string, x: number, y: number, props: Record<string, string> = {}, rot: 0 | 1 | 2 | 3 = 0): Part {
  return { id: `p${n++}`, ref, sym, x, y, rot, mirror: false, props: { ...defaultProps(symbolOf(sym)), ...props } };
}
const wire = (ax: number, ay: number, bx: number, by: number) => ({ id: `w${n++}`, a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** V1 (5 V) at x=0 with + at y=-30; R1 from (30,-60)…; a 10k/10k divider to ground. */
function divider(): Sheet {
  const s = emptySheet();
  s.parts.push(
    part('vdc', 'V1', 0, 0, { value: '5' }),
    part('resistor', 'R1', 60, -30, { value: '10k' }, 1), // vertical: pins (60,-60) and (60,0)
    part('resistor', 'R2', 60, 30, { value: '10k' }, 1), //  pins (60,0) and (60,60)
    part('gnd', '#PWR01', 0, 60),
    part('gnd', '#PWR02', 60, 60),
  );
  s.wires.push(wire(0, -30, 0, -60), wire(0, -60, 60, -60), wire(0, 30, 0, 60));
  return s;
}

describe('engineering values (UI-08 (g))', () => {
  it('parses schematic notation', () => {
    expect(parseValue('10k')).toBe(10e3);
    expect(parseValue('4k7')).toBeCloseTo(4700);
    expect(parseValue('4u7')).toBeCloseTo(4.7e-6);
    expect(parseValue('100n')).toBeCloseTo(1e-7);
    expect(parseValue('2.2M')).toBeCloseTo(2.2e6);
    expect(parseValue('1meg')).toBeCloseTo(1e6);
    expect(parseValue('10m')).toBeCloseTo(0.01);
    expect(parseValue('4R7')).toBeCloseTo(4.7);
    expect(parseValue('330Ω')).toBe(330);
    expect(parseValue('5V')).toBe(5);
    expect(parseValue('1e-3')).toBe(1e-3);
    expect(parseValue('abc')).toBeNull();
    expect(parseValue('')).toBeNull();
  });
  it('formats with SI prefixes and never misreads m/M in SPICE', () => {
    expect(formatValue(0.00123, 'A')).toBe('1.23 mA');
    expect(formatValue(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatValue(0, 'V')).toBe('0 V');
    expect(spiceNumber(1e6)).toBe('1000000');
    expect(spiceNumber(1e-3)).toBe('0.001');
    expect(nearestStandard(4600)).toBe(4700);
  });
});

describe('symbol library', () => {
  it('every pin is on the 10-unit grid and pin numbers are unique', () => {
    for (const s of SYMBOLS) {
      const ids = new Set(s.pins.map((p) => p.id));
      expect(ids.size, s.id).toBe(s.pins.length);
      for (const p of s.pins) { expect(Math.abs(p.x % 10), `${s.id}.${p.id}`).toBe(0); expect(Math.abs(p.y % 10), `${s.id}.${p.id}`).toBe(0); }
    }
  });
  it('part picker search (UI-08 (a))', () => {
    expect(searchSymbols('res').map((s) => s.id)).toContain('resistor');
    expect(searchSymbols('2n3904').map((s) => s.id)).toEqual(['npn']);
    expect(searchSymbols('lm358').map((s) => s.id)).toEqual(['opamp']);
  });
  it('rail voltages from names', () => {
    expect(railVoltage('+5V')).toBe(5);
    expect(railVoltage('+3V3')).toBe(3.3);
    expect(railVoltage('-12V')).toBe(-12);
    expect(railVoltage('VCC')).toBeNull();
  });
  it('rotation is clockwise quarter turns, mirror before rotation', () => {
    expect(toWorld({ x: 0, y: 0, rot: 1, mirror: false }, { x: -30, y: 0 })).toEqual({ x: 0, y: -30 });
    expect(toWorld({ x: 100, y: 0, rot: 0, mirror: true }, { x: -30, y: 0 })).toEqual({ x: 130, y: 0 });
  });
});

describe('connectivity and netlist (INV-08)', () => {
  it('wires, T-junctions and power symbols form nets', () => {
    const s = divider();
    const c = connectivity(s);
    const names = c.nets.map((x) => x.name).sort();
    expect(names).toContain('GND');
    const gnd = c.nets.find((x) => x.name === 'GND')!;
    expect(gnd.pins.sort()).toEqual(['R2.2', 'V1.2']);
    // R1.2 and R2.1 meet at (60,0) pin-on-pin
    expect(c.pinNet.get('R1.2')).toBe(c.pinNet.get('R2.1'));
    expect(c.pinNet.get('V1.1')).toBe(c.pinNet.get('R1.1'));
  });
  it('crossing wires do not connect; a wire end on a wire does, with a junction dot', () => {
    const s = emptySheet();
    s.wires.push(wire(0, 0, 100, 0), wire(50, -50, 50, 50));
    s.parts.push(part('resistor', 'R1', -30, 0), part('resistor', 'R2', 50, -80, {}, 1), part('resistor', 'R3', 50, 80, {}, 1));
    let c = connectivity(s);
    expect(c.pinNet.get('R1.2')).not.toBe(c.pinNet.get('R2.2'));
    expect(c.junctions).toEqual([]);
    s.wires.push(wire(50, 0, 50, -50)); // vertical wire now ends on the horizontal one
    c = connectivity(s);
    expect(c.pinNet.get('R1.2')).toBe(c.pinNet.get('R2.2'));
    expect(c.junctions).toContainEqual({ x: 50, y: 0 });
  });
  it('labels with the same name join nets', () => {
    const s = emptySheet();
    s.parts.push(part('resistor', 'R1', 0, 0), part('resistor', 'R2', 200, 0));
    s.wires.push(wire(30, 0, 60, 0), wire(170, 0, 140, 0));
    s.labels.push({ id: 'l1', name: 'SIG', x: 60, y: 0 }, { id: 'l2', name: 'SIG', x: 140, y: 0 });
    const c = connectivity(s);
    expect(c.pinNet.get('R1.2')).toBe('SIG');
    expect(c.pinNet.get('R2.1')).toBe('SIG');
  });
  it('the netlist matches the ef.netlist schema and diffs describe edits', () => {
    const s = divider();
    const a = buildNetlist(s);
    expect(a.parts.map((p) => p.ref)).toEqual(['R1', 'R2', 'V1']);
    expect(a.parts.every((p) => p.standard === false)).toBe(true);
    const pins = a.nets.flatMap((x) => x.pins);
    expect(new Set(pins).size).toBe(pins.length);
    const s2 = { ...s, wires: s.wires.slice(1) };
    const d = diffNetlist(a, buildNetlist(s2));
    expect(describeDiff(d)).toMatch(/V1\.1|R1\.1/);
  });
  it('annotation numbers references by position', () => {
    const s = emptySheet();
    s.parts.push(part('resistor', 'R7', 0, 100), part('resistor', 'R3', 0, 0));
    const a = annotate(s);
    expect(a.parts.find((p) => p.y === 0)!.ref).toBe('R1');
    expect(nextRef(a, 'R')).toBe('R3');
  });
});

describe('ERC (ED-09)', () => {
  it('clean divider: only the not-a-standard-part notice', () => {
    const issues = erc(divider());
    expect(issues.filter((i) => i.severity !== 'info')).toEqual([]);
    expect(issues.some((i) => i.rule === 'ED-08')).toBe(true);
  });
  it('finds unconnected pins, missing ground, floating nets, shorted sources and duplicates', () => {
    const s = emptySheet();
    s.parts.push(part('resistor', 'R1', 0, 0), part('resistor', 'R1', 100, 0), part('vdc', 'V1', 300, 0));
    s.wires.push(wire(300, -30, 330, -30), wire(330, -30, 330, 30), wire(330, 30, 300, 30));
    const rules = erc(s).map((i) => i.rule);
    expect(rules).toContain('ED-09.a');
    expect(rules).toContain('ED-09.c');
    expect(rules).toContain('ED-09.d');
    expect(rules).toContain('ED-09.e');
  });
  it('a node held only by a capacitor floats', () => {
    const s = divider();
    s.parts.push(part('capacitor', 'C1', 200, 0, {}, 1), part('gnd', '#PWR03', 200, 30));
    s.wires.push(wire(200, -30, 200, -60));
    s.labels.push({ id: 'x', name: 'TOP', x: 200, y: -60 });
    expect(erc(s).some((i) => i.rule === 'ED-09.c' && i.message.includes('TOP'))).toBe(true);
  });
});

describe('schematic simulation (SIM-01)', () => {
  it('operating point of the divider', () => {
    const r = simulate(divider()) as SimResult;
    expect('error' in r).toBe(false);
    const mid = connectivity(divider()).pinNet.get('R1.2')!;
    expect(r.v[mid][0]).toBeCloseTo(2.5, 6);
    expect(r.i['R1.1'][0]).toBeCloseTo(2.5e-4, 9);
    expect(r.i['V1.1'][0]).toBeCloseTo(-2.5e-4, 9);
  });
  it('a +5V rail without a source gets an ideal supply and says so', () => {
    const s = emptySheet();
    s.parts.push(part('power', '#PWR01', 0, -30, { value: '+5V' }), part('resistor', 'R1', 0, 0, {}, 1), part('led', 'D1', 0, 60, { colour: 'red' }, 1), part('gnd', '#PWR02', 0, 90));
    s.parts[1] = { ...s.parts[1], props: { value: '330' } };
    s.wires.push(wire(0, 30, 0, 30)); // R1.2 (0,30) touches D1 pin 2 (0,30)
    const r = simulate(s) as SimResult;
    expect('error' in r).toBe(false);
    expect(r.rails).toEqual([{ net: '+5V', volts: 5 }]);
    const iLed = r.i['D1.2'][0];
    expect(iLed).toBeGreaterThan(0.008);
    expect(iLed).toBeLessThan(0.0095);
  });
  it('no ground is an error, not a silent result', () => {
    const s = divider();
    s.parts = s.parts.filter((p) => p.sym !== 'gnd');
    expect('error' in simulate(s)).toBe(true);
  });
  it('transient of an RC with a pulse source', () => {
    const s = divider();
    s.parts[0] = part('vpulse', 'V1', 0, 0, { value: '5', low: '0', freq: '100', duty: '50', edge: '1u' });
    s.parts[2] = part('capacitor', 'C1', 60, 30, { value: '1u' }, 1);
    s.sim = { type: 'tran', stop: '10m', step: '10u' };
    const r = simulate(s) as SimResult;
    expect('error' in r).toBe(false);
    const mid = connectivity(s).pinNet.get('R1.2')!;
    // tau = 10 ms: after 5 ms of 5 V, v = 5(1 − e^−0.5) = 1.967 V
    const k = r.x.findIndex((t) => t >= 5e-3);
    expect(r.v[mid][k]).toBeCloseTo(5 * (1 - Math.exp(-0.5)), 1);
  });
  it('DC sweep of a source and the SPICE export names it', () => {
    const s = divider();
    s.sim = { type: 'dc', target: 'V1', param: 'value', start: '0', stop: '10', step: '1' };
    const r = simulate(s) as SimResult;
    expect(r.x.length).toBe(11);
    const sp = schematicSpice(s);
    expect(sp).toMatch(/^V1 /m);
    expect(sp).toMatch(/^\.dc V1 0 10 1$/m);
    expect(sp).toMatch(/^R1 /m);
  });
});

describe('ERC knows every part', () => {
  it('every simulated symbol says which of its pins conduct at DC (only capacitors and current sources do not)', async () => {
    const { DC_PATH } = await import('../src/eda/erc');
    const { SYMBOLS } = await import('../src/eda/symbols');
    const missing = SYMBOLS.filter((s) => s.simulated && !s.power && !s.logic && !(s.id in DC_PATH)).map((s) => s.id);
    expect(missing.sort()).toEqual(['capacitor', 'capacitor_pol', 'idc']);
  });
});
