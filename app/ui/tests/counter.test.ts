// The CD4020 ripple counter: counts falling clock edges, RESET clears it, Q1 and Q4 … Q14.
import { expect, it } from 'vitest';
import { NB } from '../src/eda/powerExamples';
import { simulate, type SimResult } from '../src/sim/run';

it('a 1 kHz clock: Q4 rises after 8 falling edges, Q10 after 512; RESET holds it at zero', () => {
  const nb = new NB();
  nb.part('VDD', 'battery', 0, 0, { value: '12', rint: '0.01' }, { '1': 'V12', '2': 'GND' }, 1)
    .part('VC', 'vpulse', 100, 0, { value: '12', low: '0', freq: '1k', duty: '50', delay: '0', edge: '1u' }, { '1': 'CK', '2': 'GND' })
    .part('VR', 'vpulse', 200, 0, { value: '12', low: '0', freq: '1', duty: '10', delay: '0.6', edge: '1u' }, { '1': 'RS', '2': 'GND' })
    .part('U1', 'cd4020', 400, 0, { value: 'V12' }, { '10': 'CK', '11': 'RS', '9': 'Q1', '7': 'Q4', '14': 'Q10' });
  nb.sim({ type: 'tran', stop: '0.7', step: '50u', start: 'zero' });
  const r = simulate(nb.done()) as SimResult;
  expect('error' in r ? (r as unknown as { error: string }).error : '').toBe('');
  const at = (n: string, t: number) => r.v[n][r.x.findIndex((x) => x >= t)];
  // the first falling edge at 0.5 ms; Q4 high after the 8th (7.5 ms) until the 16th (15.5 ms)
  expect(at('Q4', 7.0e-3)).toBeLessThan(1);
  expect(at('Q4', 8.0e-3)).toBeGreaterThan(11);
  expect(at('Q4', 16.0e-3)).toBeLessThan(1);
  expect(at('Q10', 0.5)).toBeLessThan(1);
  expect(at('Q10', 0.513)).toBeGreaterThan(11);
  expect(at('Q10', 0.62)).toBeLessThan(1); // reset at 0.6 s
});
