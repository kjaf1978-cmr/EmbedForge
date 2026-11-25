// The netlist builder's part keys: one part per key, in every design (D47 checklist).
import { expect, it } from 'vitest';
import { DESIGNS } from '../../../tools/kicad/layouts';
it('every board design builds, and no part key is used twice (a second part under a key took the first one\'s probes and refOf)', () => {
  const g = globalThis as { __nbDupes?: string[] };
  const out: Record<string, string[]> = {};
  for (const [name, d] of Object.entries(DESIGNS as Record<string, { sheet: () => unknown }>)) {
    g.__nbDupes = [];
    try { d.sheet(); } catch (e) { g.__nbDupes.push(`ERROR ${(e as Error).message}`); }
    if (g.__nbDupes.length) out[name] = [...new Set(g.__nbDupes)];
  }
  delete g.__nbDupes;
  expect(out).toEqual({});
}, 1200000);
