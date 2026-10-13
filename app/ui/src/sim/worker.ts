// Simulation worker: one message per run.
import { simulate } from './run';
import type { Sheet } from '../eda/schematic';

self.onmessage = (e: MessageEvent<{ id: number; sheet: Sheet }>) => {
  let result;
  try { result = simulate(e.data.sheet); } catch (err) { result = { error: `Simulation failed: ${(err as Error).message}`, errors: [] }; }
  (self as unknown as Worker).postMessage({ id: e.data.id, result });
};
