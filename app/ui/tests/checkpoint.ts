// Checkpoints for the long simulation runs (LONG=1 with CKPT=<directory>): the engine hands its
// whole state over every CKPT_EVERY seconds of computing (default 1200), and a run that was cut
// off (a restarted container) resumes from the last one; the files are removed after the run.
// The engine's own state is stored as it is (the run continues exactly); the waveforms recorded
// so far go to one chunk file per save, only the points added since the last one, the values in
// single precision (the time axis in double): a high-frequency run records about 2 GB in
// double precision, more than the disk holds twice over.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import crypto from 'node:crypto';
import { expect } from 'vitest';
import type { SimCheckpoint, Waveforms } from '../src/sim/engine';

type G = { __simCheckpoint?: SimCheckpoint };
type State = { out: Waveforms } & Record<string, unknown>;
interface Chunk { x: Float64Array; v: Record<string, Float32Array>; i: Record<string, Float32Array[]> }

/** A fingerprint of the simulator's and the designs' sources (src/eda, src/sim): a checkpoint
 *  made with other code (a changed model) is not resumed. A rerun after the TL074 model was added
 *  resumed from states made with the old one, found in the run logs. */
let sourceHash: string | undefined;
function sources(): string {
  if (sourceHash) return sourceHash;
  const h = crypto.createHash('sha256');
  const root = path.join(__dirname, '..', 'src');
  for (const d of ['eda', 'sim']) {
    const dir = path.join(root, d);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts')).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  }
  return (sourceHash = h.digest('hex').slice(0, 16));
}

/** Installs the hooks for the current test (when CKPT is set); returns the clean-up to call
 *  once the simulation has finished. */
export function useCheckpoint(dir = process.env.CKPT, every = Number(process.env.CKPT_EVERY ?? 1200)): () => void {
  if (!dir) return () => {};
  const name = (expect.getState().currentTestName ?? 'run').replace(/[^\w]+/g, '_').slice(0, 150);
  const file = path.join(dir, `${name}.ckpt`);
  const chunk = (k: number) => `${file}.w${k}`;
  fs.mkdirSync(dir, { recursive: true });
  let chunks = 0, written = 0;
  (globalThis as G).__simCheckpoint = {
    every,
    save: (st) => {
      const s = st as State, o = s.out, n = o.x.length;
      const c: Chunk = { x: Float64Array.from(o.x.slice(written, n)), v: {}, i: {} };
      for (const [k, a] of Object.entries(o.v)) c.v[k] = Float32Array.from(a.slice(written, n));
      for (const [k, t] of Object.entries(o.i)) c.i[k] = t.map((a) => Float32Array.from(a.slice(written, n)));
      fs.writeFileSync(chunk(chunks), v8.serialize(c));
      const head = { ...s, out: { x: [], v: {}, i: {}, warnings: o.warnings }, chunks: chunks + 1, written: n, sources: sources() };
      fs.writeFileSync(`${file}.tmp`, v8.serialize(head)); fs.renameSync(`${file}.tmp`, file);
      chunks++; written = n;
    },
    load: () => {
      if (!fs.existsSync(file)) return undefined;
      const head = v8.deserialize(fs.readFileSync(file)) as State & { chunks: number; written: number; sources?: string };
      if (head.sources !== sources()) {
        // made with other code: start afresh (and remove it, so its chunks do not mix with new ones)
        fs.rmSync(file, { force: true });
        for (let k = 0; fs.existsSync(chunk(k)); k++) fs.rmSync(chunk(k));
        return undefined;
      }
      const o: Waveforms = { x: [], v: {}, i: {}, warnings: head.out.warnings };
      for (let k = 0; k < head.chunks; k++) {
        const c = v8.deserialize(fs.readFileSync(chunk(k))) as Chunk;
        for (const t of c.x) o.x.push(t);
        for (const [n, a] of Object.entries(c.v)) { const d = (o.v[n] ??= []); for (const y of a) d.push(y); }
        for (const [n, t] of Object.entries(c.i)) { const d = (o.i[n] ??= t.map(() => [])); t.forEach((a, j) => { for (const y of a) d[j].push(y); }); }
      }
      chunks = head.chunks; written = head.written;
      return { ...head, out: o };
    },
  };
  return () => {
    delete (globalThis as G).__simCheckpoint;
    fs.rmSync(file, { force: true });
    for (let k = 0; fs.existsSync(chunk(k)); k++) fs.rmSync(chunk(k));
  };
}
