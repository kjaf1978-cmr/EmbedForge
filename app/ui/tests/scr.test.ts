// The thyristor (SCR) model: off until gated, on until its current's zero, one way only.
import { expect, it } from 'vitest';
import { NB } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';

it('a thyristor gated at 2 ms of a 50 Hz half wave conducts to the current zero (10 ms) and blocks the negative half; ungated it blocks both', () => {
  const nb = new NB();
  nb.part('VS', 'vsin', 0, 0, { value: '325', freq: '50' }, { '1': 'L', '2': 'GND' }, 1)
    .part('Q1', 'scr', 100, 0, { value: 'VS-40TPS12' }, { '1': 'L', '2': 'K', '3': 'G' })
    .part('RL', 'resistor', 200, 0, { value: '10' }, { '1': 'K', '2': 'GND' }, 1)
    // gate: 10 V, 1 ms pulses at 2 ms and 22 ms through 100 Ω from K (100 mA)
    .part('VG', 'vpulse', 300, 0, { value: '10', low: '0', freq: '50', duty: '5', delay: '2m', edge: '1u' }, { '1': 'GP', '2': 'K' })
    .part('RG', 'resistor', 300, -100, { value: '100' }, { '1': 'GP', '2': 'G' })
    .part('Q2', 'scr', 100, 300, { value: 'VS-40TPS12' }, { '1': 'L', '2': 'K2', '3': 'K2' })
    .part('RL2', 'resistor', 200, 300, { value: '10' }, { '1': 'K2', '2': 'GND' }, 1);
  nb.sim({ type: 'tran', stop: '40m', step: '20u', start: 'zero' });
  const r = simulate(nb.done()) as SimResult;
  const at = (n: string, t: number) => r.v[n][r.x.findIndex((x) => x >= t)];
  expect(Math.abs(at('K', 1.5e-3))).toBeLessThan(1); // not yet gated
  expect(at('K', 5e-3)).toBeGreaterThan(300); // on, the drop about 1.5 V
  expect(at('K', 9e-3)).toBeGreaterThan(45); // still on near the end of the half wave (gate gone at 3 ms)
  expect(Math.abs(at('K', 15e-3))).toBeLessThan(1); // the negative half blocked
  expect(Math.abs(at('K', 21e-3))).toBeLessThan(1); // off until the next gate pulse
  expect(at('K', 25e-3)).toBeGreaterThan(300);
  expect(Math.max(...r.v['K2'].map(Math.abs))).toBeLessThan(1); // never gated
});
