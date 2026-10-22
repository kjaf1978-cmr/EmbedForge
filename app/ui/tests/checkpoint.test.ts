// A transient cut off at a checkpoint and resumed gives the same waveforms as one run straight
// through (the long inverter runs depend on it, see checkpoint.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { describe, expect, it } from 'vitest';
import { inverterLF } from '../src/eda/inverters';
import { simulate, type SimResult } from '../src/sim/run';
import type { SimCheckpoint } from '../src/sim/engine';

type G = { __simCheckpoint?: SimCheckpoint };

describe('simulation checkpoints', () => {
  it('the 50 Hz inverter (MOSFETs, saturating transformer, comparators, logic, op-amps): resumed from a checkpoint, the same waveforms as straight through', () => {
    const sheet = () => inverterLF({ precharged: true, stop: '1.2m' }).sheet;
    const straight = simulate(sheet()) as SimResult;
    expect('error' in straight).toBe(false);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-')), 'run.ckpt');
    // first run: a checkpoint after every accepted step, cut off at the 2000th
    let saves = 0;
    (globalThis as G).__simCheckpoint = {
      every: 0,
      save: (s) => { if (++saves === 2000) { fs.writeFileSync(file, v8.serialize(s)); throw new Error('cut off'); } },
      load: () => undefined,
    };
    expect(() => simulate(sheet())).toThrow('cut off');
    // second run: resumes from it
    (globalThis as G).__simCheckpoint = { every: 1e9, save: () => {}, load: () => v8.deserialize(fs.readFileSync(file)) };
    const resumed = simulate(sheet()) as SimResult;
    delete (globalThis as G).__simCheckpoint;
    expect('error' in resumed).toBe(false);
    expect(resumed.x.length).toBe(straight.x.length);
    for (const n of ['OUTL', 'VA', 'SWA', 'BUS']) {
      const a = straight.v[n], b = resumed.v[n];
      expect(Math.max(...a.map((v, k) => Math.abs(v - b[k])))).toBeLessThan(1e-9);
    }
  }, 600_000);
});

describe('the long tests\' checkpoint files (checkpoint.ts)', () => {
  it('cut off and resumed from the files: the same waveforms as straight through, the history before the cut within single precision', async () => {
    const { useCheckpoint } = await import('./checkpoint');
    const sheet = () => inverterLF({ precharged: true, stop: '1.2m' }).sheet;
    const straight = simulate(sheet()) as SimResult;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-'));
    let done = useCheckpoint(dir, 0);
    const g = globalThis as G, save = g.__simCheckpoint!.save;
    let saves = 0;
    g.__simCheckpoint!.save = (s) => { if (++saves % 500 === 0) save(s); if (saves === 2100) throw new Error('cut off'); };
    expect(() => simulate(sheet())).toThrow('cut off');
    delete g.__simCheckpoint;
    expect(fs.readdirSync(dir).length).toBe(5); // the head and four chunks
    done = useCheckpoint(dir, 1e9);
    const resumed = simulate(sheet()) as SimResult;
    done();
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(resumed.x).toEqual(straight.x);
    for (const n of ['OUTL', 'VA', 'SWA', 'BUS']) {
      const a = straight.v[n], b = resumed.v[n];
      expect(Math.max(...a.map((v, k) => Math.abs(v - b[k]) / Math.max(1, Math.abs(v))))).toBeLessThan(1e-6);
    }
  }, 600_000);
});
