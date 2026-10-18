// Worst-case tolerances of the inverters' thresholds (decision D32): every protection and
// regulation level computed from the drawn parts at each corner of their tolerances: each
// resistor's own (its `tol`, 1 % when empty), the TL431 references (1 %, the B grade 0.5 %), the
// LM317 rails (4 %), the comparators' offset (5 mV), the battery-sense diode's drop (0.6 … 0.9 V)
// and the NTC (R25 and B 1 % each). A comparator input is a resistive node fed from known
// voltages, so its voltage is linear in the unknown supply and each corner's trip point is exact.
import { describe, expect, it } from 'vitest';
import { inverterHF, inverterLF } from '../src/eda/inverters';
import { parseValue } from '../src/eda/units';
import type { NB } from '../src/eda/powerExamples';
import type { Sheet } from '../src/eda/schematic';

/** Branch into a node: a source voltage behind a resistance. */
type Branch = [r: number, v: number];
const nodeV = (bs: Branch[]) => bs.reduce((a, [r, v]) => a + v / r, 0) / bs.reduce((a, [r]) => a + 1 / r, 0);
/** The supply x at which f(x) = target, f linear in x. */
const solve = (f: (x: number) => number, target: number) => { const b = f(0), a = f(1) - b; return (target - b) / a; };
/** Every corner of n tolerances (each −1 or +1): the extremes of fn over them. */
function corners(n: number, fn: (s: number[]) => number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let m = 0; m < 1 << n; m++) {
    const v = fn([...Array(n)].map((_, i) => ((m >> i) & 1 ? 1 : -1)));
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  return [lo, hi];
}
const OFF = 5e-3, RAIL = 0.04, VREF = 2.495;

function parts(build: () => { sheet: Sheet; nb: NB }) {
  const { sheet, nb } = build();
  const part = (k: string) => sheet.parts.find((p) => p.id === nb.ids.get(k))!;
  /** resistor k at corner s (−1 … +1) of its own tolerance */
  const R = (k: string, s: number) => { const p = part(k); return parseValue(p.props.value)! * (1 + s * (p.props.tol?.trim() ? parseValue(p.props.tol)! : 1) / 100); };
  /** a TL431's reference at corner s */
  const ref = (k: string, s: number) => VREF * (1 + s * (part(k).props.value === 'TL431B' ? 0.005 : 0.01));
  return { R, ref, part };
}
const fmt = ([lo, hi]: [number, number], u = 'V') => `${lo.toFixed(2)} … ${hi.toFixed(2)} ${u}`;

/** The battery window of either unit (low cut-out with restart, high cut-out), from the battery
 *  through the sense diode; `vr` the reference's net key, `en` the enable's high level. */
function batteryWindow(R: (k: string, s: number) => number, ref: (k: string, s: number) => number, refKey: string) {
  const v12 = (s: number) => 1.25 * (1 + s * RAIL) * (1 + 2.05e3 / 240);
  // low: ULV + = VBS (battery divider, hysteresis RLVH from the enable), − = VLO; the enable
  // high through REN (10k) from 12 V
  const low = (restart: boolean) => corners(8, ([a, b, c, d, e, r, o, dd]) => {
    const vlo = ref(refKey, r) * R('RLV2', d) / (R('RLV1', e) + R('RLV2', d));
    const vd = 0.75 + 0.15 * dd;
    const bat = solve((x) => nodeV([[R('RBS1', a), x - vd], [R('RBS2', b), 0], [R('RLVH', c) + (restart ? 0 : 10e3), restart ? 0 : v12(o)]]), vlo + o * OFF);
    return bat;
  });
  // high: UHV + = VHI (the reference's divider, hysteresis RHVH and the pull-up RHVN from
  // 12 V while the output is high), − = VBH
  const high = corners(8, ([a, b, c, d, e, r, o, dd]) => {
    const vhi = nodeV([[R('RHV1', d), ref(refKey, r)], [R('RHV2', e), 0], [R('RHVH', c) + 10e3, v12(o)]]);
    const vd = 0.75 + 0.15 * dd;
    return solve((x) => nodeV([[R('RBH1', a), x - vd], [R('RBH2', b), 0]]), vhi + o * OFF);
  });
  return { cut: low(false), restart: low(true), high };
}

/** Heatsink cut-out: NTC (R25, B) against the reference's divider RT90/RT90B, NTC to the
 *  reference with RTHB below; the temperature at which NHS falls to T90. */
function heatsink(R: (k: string, s: number) => number) {
  return corners(5, ([a, b, c, n, bb]) => {
    const t90 = R('RT90B', b) / (R('RT90', a) + R('RT90B', b)), rntc = R('RTHB', c) * (1 - t90) / t90;
    const r25 = 10e3 * (1 + 0.01 * n), beta = 3950 * (1 + 0.01 * bb);
    return 1 / (1 / 298.15 + Math.log(rntc / r25) / beta) - 273.15;
  });
}

describe('high-frequency inverter: worst-case thresholds', () => {
  const { R, ref } = parts(() => inverterHF());
  // the bus feedback: TL431 × (1 + (RFB1 + RFB2)/RFB3)
  const reg = corners(4, ([a, b, c, r]) => ref('UFB', r) * (1 + (R('RFB1', a) + R('RFB2', b)) / R('RFB3', c)));
  // bus overvoltage: BOR (the reference's divider, hysteresis RBOH from the output: high
  // through the pull-up from V15H while the bus is below the trip) against BOS
  const ov = (rising: boolean) => corners(8, ([a, b, c, d, e, f, r, o]) => {
    const vh = 14.97 * (1 + f * 0.01);
    const bor = nodeV([[R('RBV1', a), ref('UREF', r)], [R('RBV2', b), 0], [R('RBOH', e), rising ? vh : 0.2]]);
    return solve((bus) => nodeV([[R('RBO1', c) + R('RBO2', c), bus], [R('RBO3', d), 0]]), bor + o * OFF);
  });
  // the sine bridge's bus window: EN high above the start level; BUV against VLOH, the
  // hysteresis from EN (low while stopped, about 14.9 V while running)
  const win = (starting: boolean) => corners(7, ([a, b, c, d, e, r, o]) => {
    const vloh = ref('UREF', r) * R('RLH2', d) / (R('RLH1', e) + R('RLH2', d));
    return solve((bus) => nodeV([[R('RUV1', a) + R('RUV2', a), bus], [R('RUV3', b), 0], [R('RUVH', c), starting ? 0 : 14.9]]), vloh + o * OFF);
  });
  // DC-DC overload timer: the command's ceiling against the threshold (both from VREFL)
  const vcMax = corners(2, ([a, b]) => VREF * R('RVC2', b) / (R('RVC', a) + R('RVC2', b)));
  const vot = corners(3, ([a, b, o]) => VREF * R('ROTB', b) / (R('ROTA', a) + R('ROTB', b)) + o * OFF);
  // undervoltage lockout of the 15 V: ULS (RUL1/RUL2) against VREF
  const uvlo = corners(4, ([a, b, r, o]) => (ref('UREF', r) + o * OFF) * (R('RUL1', a) + R('RUL2', b)) / R('RUL2', b));
  const bw = batteryWindow(R, ref, 'UREFL'), hs = heatsink(R);

  it('the table (printed)', () => {
    console.log('HF bus regulation', fmt(reg));
    console.log('HF bus overvoltage trip', fmt(ov(true)), '; release', fmt(ov(false)));
    console.log('HF sine bridge start', fmt(win(true)), '; stop', fmt(win(false)));
    console.log('HF DC-DC overload: ceiling', fmt(vcMax), '; threshold', fmt(vot));
    console.log('HF 15 V lockout', fmt(uvlo));
    console.log('HF battery cut-out', fmt(bw.cut), '; restart', fmt(bw.restart), '; high cut-out', fmt(bw.high));
    console.log('HF heatsink cut-out', fmt(hs, '°C'));
    expect(reg[0]).toBeGreaterThan(0);
  });
  it('the bus: regulated within 381 V ± 1.5 %; the overvoltage stop below 430 V (450 V capacitors) and at least 30 V above the highest regulation (a load dump overshoots about 34 V from 381 V, H-3); the sine bridge starts at least 10 V below the lowest regulation', () => {
    expect(reg[0]).toBeGreaterThan(381 * 0.985); expect(reg[1]).toBeLessThan(381 * 1.015);
    expect(ov(true)[1]).toBeLessThan(430);
    expect(ov(true)[0]).toBeGreaterThan(reg[1] + 30);
    expect(ov(false)[0]).toBeGreaterThan(win(true)[1]);
    expect(win(true)[1]).toBeLessThan(reg[0] - 10);
    expect(win(false)[0]).toBeGreaterThan(300);
  });
  it('the DC-DC overload timer always trips at the command\'s ceiling, and the 15 V lockout stays below the lowest 15 V rail (LM317: 14.4 V)', () => {
    expect(vcMax[0] - vot[1]).toBeGreaterThan(0.02);
    expect(uvlo[1]).toBeLessThan(14.4 - 0.5);
  });
  it('the battery (16 LiFePO4 cells): the cut-out never below 2.5 V a cell (40 V), the high cut-out at least 1.5 V above a full charge (58.4 V) and below the MOSFETs\' 100 V; the heatsink cut-out within 80 … 95 °C', () => {
    expect(bw.cut[0]).toBeGreaterThan(40); expect(bw.restart[0]).toBeGreaterThan(bw.cut[1]);
    expect(bw.high[0]).toBeGreaterThan(58.4 + 1.5); expect(bw.high[1]).toBeLessThan(70);
    expect(hs[0]).toBeGreaterThan(80); expect(hs[1]).toBeLessThan(95);
  });
});

describe('50 Hz-transformer inverter: worst-case thresholds', () => {
  const { R, ref } = parts(() => inverterLF());
  const bw = batteryWindow(R, ref, 'UREF'), hs = heatsink(R);
  it('the table (printed)', () => {
    console.log('LF battery cut-out', fmt(bw.cut), '; restart', fmt(bw.restart), '; high cut-out', fmt(bw.high));
    console.log('LF heatsink cut-out', fmt(hs, '°C'));
    expect(bw.cut[0]).toBeGreaterThan(0);
  });
  it('the battery and the heatsink as the high-frequency unit\'s', () => {
    expect(bw.cut[0]).toBeGreaterThan(40); expect(bw.restart[0]).toBeGreaterThan(bw.cut[1]);
    expect(bw.high[0]).toBeGreaterThan(58.4 + 1.5); expect(bw.high[1]).toBeLessThan(70);
    expect(hs[0]).toBeGreaterThan(80); expect(hs[1]).toBeLessThan(95);
  });
});
