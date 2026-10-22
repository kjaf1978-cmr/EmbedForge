// Checkpoints for the long simulation runs (LONG=1 with CKPT=<directory>): the engine stores
// its whole state every CKPT_EVERY seconds of computing (default 1200), and a run that was cut
// off (a restarted container) resumes from the last one; the file is removed after the run.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { expect } from 'vitest';
import type { SimCheckpoint } from '../src/sim/engine';

type G = { __simCheckpoint?: SimCheckpoint };

/** Installs the hooks for the current test (when CKPT is set); returns the clean-up to call
 *  once the simulation has finished. */
export function useCheckpoint(dir = process.env.CKPT, every = Number(process.env.CKPT_EVERY ?? 1200)): () => void {
  if (!dir) return () => {};
  const name = (expect.getState().currentTestName ?? 'run').replace(/[^\w]+/g, '_').slice(0, 150);
  const file = path.join(dir, `${name}.ckpt`);
  fs.mkdirSync(dir, { recursive: true });
  (globalThis as G).__simCheckpoint = {
    every,
    save: (s) => { fs.writeFileSync(`${file}.tmp`, v8.serialize(s)); fs.renameSync(`${file}.tmp`, file); },
    load: () => (fs.existsSync(file) ? v8.deserialize(fs.readFileSync(file)) : undefined),
  };
  return () => { delete (globalThis as G).__simCheckpoint; fs.rmSync(file, { force: true }); };
}
