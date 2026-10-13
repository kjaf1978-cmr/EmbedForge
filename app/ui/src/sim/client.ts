// Runs simulations in a Web Worker so the editor stays responsive; falls back to the main
// thread where workers are unavailable (unit tests).

import type { Sheet } from '../eda/schematic';
import { simulate, type SimFailure, type SimResult } from './run';

export type SimOutcome = SimResult | SimFailure;

export class SimClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (r: SimOutcome) => void>();

  constructor() {
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<{ id: number; result: SimOutcome }>) => {
          const cb = this.pending.get(e.data.id);
          this.pending.delete(e.data.id);
          cb?.(e.data.result);
        };
        this.worker.onerror = () => { this.worker = null; for (const [, cb] of this.pending) cb({ error: 'The simulation worker stopped.', errors: [] }); this.pending.clear(); };
      }
    } catch { this.worker = null; }
  }

  /** Simulates; results of runs overtaken by a newer one resolve to null. */
  async run(sheet: Sheet): Promise<SimOutcome | null> {
    const id = ++this.seq;
    let r: SimOutcome;
    if (this.worker) {
      r = await new Promise<SimOutcome>((res) => { this.pending.set(id, res); this.worker!.postMessage({ id, sheet }); });
    } else {
      await Promise.resolve();
      try { r = simulate(sheet); } catch (e) { r = { error: `Simulation failed: ${(e as Error).message}`, errors: [] }; }
    }
    return id === this.seq ? r : null;
  }
}
