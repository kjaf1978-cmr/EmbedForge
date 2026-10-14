// Motion of motors and servos on the schematic: what the simulation makes them do, shown on
// their symbols so the behaviour can be judged at a glance (and replayed over a transient).
//
// A motor's rotor turns at a rate proportional to the torque it produces: the largest torque
// of the run turns it at MAX_RATE, no torque leaves it still, a negative torque turns it the
// other way. A servo's horn points at its simulated angle.

import type { Mech, SimResult } from './run';

/** Rotor rate in degrees per second at the run's largest torque (two turns per second). */
export const MAX_RATE = 720;

export interface Motion {
  kind: 'rotor' | 'servo';
  /** rotor: degrees per second, proportional to the torque (signed). */
  rate?: number;
  /** rotor: torque in N·m and speed in rpm at the shown time. */
  torque?: number;
  rpm?: number;
  /** rotor: |torque| / the run's largest |torque|, 0..1. */
  share?: number;
  /** servo: horn angle in degrees (−90 … +90, 0 = centre). */
  angle?: number;
}

/** Torque averaged over the supply period before each point (induction motors pulsate at
 *  twice the supply frequency), from the running integral of the piecewise-linear torque. */
export function meanTorque(x: number[], t: number[], period?: number): number[] {
  if (!period || x.length < 2) return t;
  const cum = [0];
  for (let k = 1; k < x.length; k++) cum.push(cum[k - 1] + ((t[k] + t[k - 1]) / 2) * (x[k] - x[k - 1]));
  const at = (q: number) => {
    if (q <= x[0]) return 0;
    let lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= q) lo = m; else hi = m; }
    const h = x[hi] - x[lo], u = h > 0 ? (q - x[lo]) / h : 0;
    // integral up to q inside the segment [lo, hi], torque linear on it
    const tq = t[lo] + u * (t[hi] - t[lo]);
    return cum[lo] + ((t[lo] + tq) / 2) * (q - x[lo]);
  };
  return x.map((q, k) => {
    const a = Math.max(x[0], q - period);
    return q - a > 0 ? (at(q) - at(a)) / (q - a) : t[k];
  });
}

/** The torque series shown for each motor (averaged for induction motors), computed once per result. */
export function shownTorque(r: SimResult): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [ref, m] of Object.entries(r.mech ?? {})) if (m.kind === 'rotor' && m.torque) out[ref] = meanTorque(r.x, m.torque, m.period);
  return out;
}

/** Motion of every motor and servo at point k of the result. */
export function motionAt(r: SimResult, torque: Record<string, number[]>, k: number): Map<string, Motion> {
  const m = new Map<string, Motion>();
  for (const [ref, mech] of Object.entries(r.mech ?? {}) as [string, Mech][]) {
    if (mech.kind === 'servo') { m.set(ref, { kind: 'servo', angle: mech.angle?.[k] ?? 0 }); continue; }
    const t = torque[ref];
    if (!t) continue;
    const peak = t.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    const tk = t[k] ?? 0, share = peak > 1e-12 ? Math.abs(tk) / peak : 0;
    m.set(ref, { kind: 'rotor', torque: tk, rpm: mech.rpm?.[k], share, rate: share * MAX_RATE * Math.sign(tk) });
  }
  return m;
}
