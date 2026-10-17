// Reliability prediction (D22): MTBF of every power design at 45 °C, wear-out lives.
import { inverterLF } from '../src/eda/inverters';
import { describe, expect, it } from 'vitest';
import { changeover1, changeover3, mpptCharger, stabiliser } from '../src/eda/powerExamples';
import { reliability, type Usage } from '../src/eda/reliability';
import { deck } from './deck';

describe('reliability prediction', () => {
  it('one resistor at 40 °C: 0.2 FIT + 2 solder joints × 0.1, times the environment factor 2', () => {
    const { sheet } = deck([['resistor', { value: '1k' }, { '1': 'A', '2': 'GND' }]]);
    const r = reliability(sheet, 40);
    expect(r.fit).toBeCloseTo(2 * (0.2 + 2 * 0.1), 6);
    expect(r.joints).toBe(2);
  });
  it('the temperature factor follows Arrhenius: an op-amp at 50 °C (Ea 0.45 eV) fails 1.66 × as often as at 40 °C', () => {
    const { sheet } = deck([['opamp', { value: 'LM358' }, { '3': 'A', '2': 'B', '6': 'C', '7': 'V', '4': 'GND' }]]);
    // the IC runs 10 K above the air
    const a = reliability(sheet, 30).rows[0], b = reliability(sheet, 40).rows[0];
    expect(b.piT / a.piT).toBeCloseTo(Math.exp((0.45 / 8.617e-5) * (1 / 313.15 - 1 / 323.15)), 3);
  });
  // use in a weak tropical grid: the change-over transfers 20 times a day, the stabiliser
  // changes taps 200 times a day; 50 surges a year reach the varistors
  const designs: [string, ReturnType<typeof changeover1>['sheet'], Usage][] = [
    ['change-over 1P', changeover1().sheet, {}],
    ['change-over 3P+N', changeover3().sheet, {}],
    ['stabiliser', stabiliser().sheet, { opsPerDay: Object.fromEntries(['K1', 'K2', 'K3', 'K4', 'K5', 'K6'].map((k) => [k, 200])), contactLife: Object.fromEntries(['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'].map((k) => [k, 4.4e6])) }],
    ['MPPT charger', mpptCharger().sheet, {}],
    // the battery contactor closes once per start: a few times a day
    ['inverter (50 Hz transformer)', inverterLF().sheet, { opsPerDay: { K1: 5 } }],
  ];
  for (const [name, sheet, usage] of designs) {
    it(`${name}: MTBF at 45 °C at least 5 years; every wear-out part lasts at least 5 years at its use`, () => {
      const r = reliability(sheet, 45, undefined, usage);
      expect(r.mtbfYears).toBeGreaterThan(5);
      for (const w of r.wear) expect(w.years, `${w.ref} ${w.what}`).toBeGreaterThan(5);
    });
  }
});
