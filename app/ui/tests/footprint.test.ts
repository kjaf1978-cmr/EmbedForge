// Footprints (PCB-02): every part and model has one, its pads match the symbol's pins, the
// pin-outs follow the datasheets, and every footprint passes the EF-PROTO-STD profile.
import { describe, expect, it } from 'vitest';
import { FOOTPRINTS } from '../src/pcb/footprint';
import { checkFootprint, EF_PROTO_STD, padGap, ring } from '../src/pcb/profile';
import { footprintChoices, footprintOf, logicRailVoltage, pinsWithoutPad } from '../src/pcb/library';
import { inverterHF, inverterLF } from '../src/eda/inverters';
import { catalogueFor } from '../src/eda/catalogue';
import { SYMBOLS } from '../src/eda/symbols';
import { defaultProps, type Part } from '../src/eda/schematic';

const part = (sym: string, props: Record<string, string> = {}): Part => ({ id: 'p', ref: 'X1', sym, x: 0, y: 0, rot: 0, mirror: false, props: { ...defaultProps(SYMBOLS.find((s) => s.id === sym)!), ...props } });
/** Every symbol with every model it offers. */
const variants = SYMBOLS.filter((s) => !s.power).flatMap((s) => (s.value.kind === 'select' ? s.value.options!.map((o) => part(s.id, { [s.value.key]: o.value })) : [part(s.id)]));
const SIM_ONLY: Record<string, string[]> = { dcmotor: ['3'], servo: ['4'] };

describe('footprint library', () => {
  it('every part and every model has a footprint', () => {
    const none = variants.filter((p) => !footprintOf(p)).map((p) => `${p.sym} ${p.props[SYMBOLS.find((s) => s.id === p.sym)!.value.key]}`);
    expect(none).toEqual([]);
  });
  for (const p of variants) {
    const label = `${p.sym} ${Object.values(p.props)[0] ?? ''}`;
    it(`${label}: every choice maps each pin to existing pads, no pad twice`, () => {
      for (const c of footprintChoices(p)) {
        const fp = FOOTPRINTS[c.footprint];
        expect(fp, c.footprint).toBeDefined();
        const ids = new Set(fp.pads.map((x) => x.id));
        const used = [...Object.values(c.pins).flat(), ...(c.rail ?? []), ...(c.gnd ?? [])];
        for (const pad of used) expect(ids.has(pad), `${c.footprint} has no pad ${pad}`).toBe(true);
        expect(new Set(used).size, `${c.footprint}: a pad is used twice`).toBe(used.length);
        expect(pinsWithoutPad(p, c)).toEqual(SIM_ONLY[p.sym] ?? []);
      }
    });
  }
  for (const fp of Object.values(FOOTPRINTS)) it(`${fp.id} passes EF-PROTO-STD (drills, rings, clearances, hole spacing, silkscreen)`, () => {
    // pads of one pin (the tactile switch's two pads per contact) may be close
    const samePin = fp.id === 'SW_Tactile_6mm' ? [['1a', '1b'], ['2a', '2b']] : [];
    expect(checkFootprint(fp, EF_PROTO_STD, samePin)).toEqual([]);
  });
});

describe('pin-outs from the datasheets', () => {
  const pads = (sym: string, value: string) => { const f = footprintOf(part(sym, { value }))!; return { fp: f.fp.id, pins: f.choice.pins }; };
  it('TO-92 transistors: 2N3904 E-B-C, BC547B C-B-E, 2N7000 S-G-D, BS170 D-G-S', () => {
    expect(pads('npn', '2N3904')).toEqual({ fp: 'TO-92_Wide', pins: { 3: ['1'], 1: ['2'], 2: ['3'] } });
    expect(pads('npn', 'BC547B').pins).toEqual({ 2: ['1'], 1: ['2'], 3: ['3'] });
    expect(pads('nmos', '2N7000').pins).toEqual({ 3: ['1'], 1: ['2'], 2: ['3'] });
    expect(pads('nmos', 'BS170').pins).toEqual({ 2: ['1'], 1: ['2'], 3: ['3'] });
  });
  it('TO-220: IRLZ44N G-D-S, 7805 IN-GND-OUT, LM317 ADJ-OUT-IN; SOT-223 AMS1117 GND-OUT-IN with the tab on OUT', () => {
    expect(pads('nmos', 'IRLZ44N')).toEqual({ fp: 'TO-220_Vertical', pins: { 1: ['1'], 2: ['2'], 3: ['3'] } });
    expect(pads('regulator', '7805').pins).toEqual({ 1: ['1'], 2: ['2'], 3: ['3'] });
    expect(pads('lm317', 'LM317').pins).toEqual({ 1: ['1'], 2: ['2'], 3: ['3'] });
    expect(pads('regulator', 'AMS1117-3.3')).toEqual({ fp: 'SOT-223', pins: { 1: ['3'], 2: ['1'], 3: ['2', '4'] } });
  });
  it('dual op-amps use pins 1, 2, 3, 4, 8; the 74HC02 has its output on pin 1; logic supply on 14 and 7', () => {
    expect(pads('opamp', 'LM358').pins).toEqual({ 2: ['2'], 3: ['3'], 4: ['4'], 6: ['1'], 7: ['8'] });
    const nor = footprintOf(part('nor2'))!.choice;
    expect(nor.pins).toEqual({ 1: ['2'], 2: ['3'], 3: ['1'] });
    expect([nor.rail, nor.gnd]).toEqual([['14'], ['7']]);
  });
  it('74HC74 on a 5 V or 3.3 V rail: D 2, CLK 3, Q 5, Q̄ 6; CLR and PRE (1, 4) tied to VCC', () => {
    for (const value of ['+5V', '+3V3']) {
      const ff = footprintOf(part('dff', { value }))!.choice;
      expect(ff.pins).toEqual({ 1: ['2'], 2: ['3'], 3: ['5'], 4: ['6'] });
      expect([ff.rail, ff.gnd]).toEqual([['14', '1', '4'], ['7']]);
      expect(ff.note).toContain('74HC74');
    }
  });
  it('above 6 V the logic is CD4000: CD4013 D 5, CLK 3, Q 1, Q̄ 2 with RESET and SET (4, 6) on VSS; CD4001 A 1, B 2, Y 3', () => {
    for (const value of ['V12', '+12V', '15V']) {
      const ff = footprintOf(part('dff', { value }))!.choice;
      expect(ff.pins).toEqual({ 1: ['5'], 2: ['3'], 3: ['1'], 4: ['2'] });
      expect([ff.rail, ff.gnd]).toEqual([['14'], ['7', '4', '6']]);
      expect(ff.note).toContain('CD4013');
      const nor = footprintOf(part('nor2', { value }))!.choice;
      expect(nor.pins).toEqual({ 1: ['1'], 2: ['2'], 3: ['3'] });
      expect([nor.rail, nor.gnd]).toEqual([['14'], ['7']]);
      expect(nor.note).toContain('CD4001');
    }
    expect(footprintOf(part('not', { value: 'V12' }))!.choice.note).toContain('CD4069');
  });
  it('logic rail voltage from the name: +5V, 3V3, V12, V15H; none from VCC', () => {
    expect([logicRailVoltage('+5V'), logicRailVoltage('3V3'), logicRailVoltage('V12'), logicRailVoltage('V15H'), logicRailVoltage('VCC')]).toEqual([5, 3.3, 12, 15, null]);
  });
  it('the parts list orders the family the board is wired for: CD4013/CD4001 on V12, 74HC74/74HC02 on +5V', () => {
    const mpn = (sym: string, raw: string) => catalogueFor({ qty: 1, refs: ['U1'], part: '', value: raw, details: '', standard: false, sym, raw })!.mpn;
    expect([mpn('dff', 'V12'), mpn('nor2', 'V12'), mpn('dff', '+5V'), mpn('nor2', '+3V3')]).toEqual(['CD4013BE', 'CD4001BE', 'SN74HC74N', 'SN74HC02N']);
  });
  it('every logic symbol has a catalogue part in both families, matching its footprint', () => {
    for (const s of SYMBOLS.filter((x) => x.logic)) for (const raw of ['V12', '+5V']) {
      const cat = catalogueFor({ qty: 1, refs: ['U1'], part: '', value: raw, details: '', standard: false, sym: s.id, raw });
      expect(cat, `${s.id} on ${raw}`).not.toBeNull();
      const chip = footprintOf(part(s.id, { value: raw }))!.choice.note!.match(/(74HC\w+|CD\w+)/)![1];
      expect(cat!.mpn, `${s.id} on ${raw}`).toContain(chip);
    }
  });
  it('the inverters on their 12 V rail get CD4013 flip-flops and CD4001 NOR gates', () => {
    const logic = [...inverterLF().sheet.parts, ...inverterHF().sheet.parts].filter((p) => p.sym === 'dff' || p.sym === 'nor2');
    expect(logic.filter((p) => p.sym === 'dff').length).toBeGreaterThan(0);
    expect(logic.filter((p) => p.sym === 'nor2').length).toBeGreaterThan(0);
    for (const p of logic) expect(footprintOf(p)!.choice.note, p.ref).toContain(p.sym === 'dff' ? 'CD4013' : 'CD4001');
   }, 60_000);
  it('DIP pads count anticlockwise from pin 1 at the top left; pad 1 is square', () => {
    const d = FOOTPRINTS['DIP-8'].pads;
    const at = (id: string) => d.find((p) => p.id === id)!;
    expect(at('1').x).toBeLessThan(0); expect(at('4').x).toBeLessThan(0); expect(at('4').y).toBeGreaterThan(at('1').y);
    expect(at('5').x).toBeGreaterThan(0); expect(at('5').y).toBeCloseTo(at('4').y, 9); expect(at('8').y).toBeCloseTo(at('1').y, 9);
    expect(at('1').shape).toBe('rect');
    expect(at('8').x - at('1').x).toBeCloseTo(7.62, 9);
  });
  it('the chosen footprint property picks the choice; an unknown one falls back to the default', () => {
    expect(footprintOf(part('resistor', { footprint: 'Chip_0805' }))!.fp.id).toBe('Chip_0805');
    expect(footprintOf(part('resistor', { footprint: 'nonsense' }))!.fp.id).toBe('R_Axial_0207');
  });
});

describe('profile checks', () => {
  it('a TO-92 with the 1.27 mm inline legs of the KiCad library fails the 0.30 mm ring (finding 3); ours passes', () => {
    const narrow = { ...FOOTPRINTS['TO-92_Wide'], pads: [-1.27, 0, 1.27].map((x, k) => ({ id: String(k + 1), x, y: 0, shape: 'oval' as const, w: 1.05, h: 1.5, drill: 0.75 })) };
    const issues = checkFootprint(narrow);
    expect(issues.filter((i) => i.rule === 'ring').map((i) => i.pad)).toEqual(['1', '2', '3']);
    expect(ring(FOOTPRINTS['TO-92_Wide'].pads[0])).toBeCloseTo(0.3, 9);
  });
  it('pad gap: circles, rectangles and a circle beside a rectangle', () => {
    const c = (x: number, y = 0) => ({ id: 'a', x, y, shape: 'circle' as const, w: 2, h: 2 });
    const r = (x: number, y = 0) => ({ id: 'b', x, y, shape: 'rect' as const, w: 2, h: 2 });
    expect(padGap(c(0), c(5))).toBeCloseTo(3, 9);
    expect(padGap(r(0), r(5))).toBeCloseTo(3, 9);
    expect(padGap(r(0), r(3, 3))).toBeCloseTo(Math.SQRT2, 9);
    expect(padGap(c(0), r(3, 3))).toBeCloseTo(Math.hypot(2, 2) - 1, 9);
  });
});
