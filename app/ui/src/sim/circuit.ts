// Circuit description for the simulation engine (SIM-01): a flat list of primitive elements
// with SPICE semantics. Node "0" is ground. The schematic layer (eda/simnet.ts) flattens parts
// such as the op-amp into these primitives; the SPICE export writes the same primitives, so
// the built-in engine and ngspice simulate identical circuits (SIM-04).

export type Wave =
  | { type: 'dc' }
  | { type: 'sin'; vo: number; va: number; freq: number; td?: number; theta?: number }
  | { type: 'pulse'; v1: number; v2: number; td: number; tr: number; tf: number; pw: number; per: number }
  | { type: 'pwl'; pts: [number, number][] };

export interface DiodeModel { is: number; n: number; rs: number; bv?: number; ibv?: number }
export interface BjtModel { type: 'npn' | 'pnp'; is: number; bf: number; br: number; nf: number; nr: number; vaf?: number; var?: number }
export interface MosModel { type: 'nmos' | 'pmos'; vto: number; kp: number; lambda: number; w: number; l: number; is: number }

export type Element =
  | { kind: 'R'; name: string; a: string; b: string; r: number }
  | { kind: 'C'; name: string; a: string; b: string; c: number }
  | { kind: 'L'; name: string; a: string; b: string; l: number }
  /** Voltage source: v(p) − v(n) = value. Branch current flows from p through the source to n. */
  | { kind: 'V'; name: string; p: string; n: string; dc: number; wave?: Wave; acMag?: number; acPhase?: number }
  /** Current source: `value` flows from p through the source to n (out of the source into n). */
  | { kind: 'I'; name: string; p: string; n: string; dc: number; wave?: Wave; acMag?: number; acPhase?: number }
  /** Voltage-controlled voltage source: v(p) − v(n) = gain·(v(cp) − v(cn)). */
  | { kind: 'E'; name: string; p: string; n: string; cp: string; cn: string; gain: number }
  /** Voltage-controlled current source: gm·(v(cp) − v(cn)) flows from p through the source to n. */
  | { kind: 'G'; name: string; p: string; n: string; cp: string; cn: string; gm: number }
  | { kind: 'D'; name: string; a: string; k: string; model: DiodeModel }
  | { kind: 'Q'; name: string; c: string; b: string; e: string; model: BjtModel }
  | { kind: 'M'; name: string; d: string; g: string; s: string; model: MosModel };

export interface Circuit {
  title?: string;
  elements: Element[];
}

/** Terminal nodes of an element, in the order its terminal currents are reported. */
export function terminals(e: Element): string[] {
  switch (e.kind) {
    case 'R': case 'C': case 'L': return [e.a, e.b];
    case 'V': case 'I': return [e.p, e.n];
    case 'E': case 'G': return [e.p, e.n, e.cp, e.cn];
    case 'D': return [e.a, e.k];
    case 'Q': return [e.c, e.b, e.e];
    case 'M': return [e.d, e.g, e.s];
  }
}

/** Value of a time-dependent source at time t (SPICE semantics for SIN, PULSE and PWL). */
export function waveAt(dc: number, w: Wave | undefined, t: number): number {
  if (!w || w.type === 'dc') return dc;
  if (w.type === 'sin') {
    const td = w.td ?? 0;
    if (t < td) return w.vo;
    const th = w.theta ?? 0;
    return w.vo + w.va * Math.exp(-(t - td) * th) * Math.sin(2 * Math.PI * w.freq * (t - td));
  }
  if (w.type === 'pulse') {
    const { v1, v2, td, tr, tf, pw, per } = w;
    if (t < td) return v1;
    let tt = t - td;
    if (per > 0) tt = tt % per;
    if (tt < tr) return tr > 0 ? v1 + (v2 - v1) * (tt / tr) : v2;
    if (tt < tr + pw) return v2;
    if (tt < tr + pw + tf) return tf > 0 ? v2 + (v1 - v2) * ((tt - tr - pw) / tf) : v1;
    return v1;
  }
  const p = w.pts;
  if (!p.length) return dc;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, v0] = p[i - 1];
      const [t1, v1] = p[i];
      return t1 > t0 ? v0 + (v1 - v0) * ((t - t0) / (t1 - t0)) : v1;
    }
  }
  return p[p.length - 1][1];
}

/** Value at t = 0 used for the operating point; SPICE uses the DC value if given, else the wave at 0. */
export function opValue(dc: number, w: Wave | undefined): number {
  return w && w.type !== 'dc' ? waveAt(dc, w, 0) : dc;
}

/** Corners of a source wave within [0, tstop] where the time step must land exactly. */
export function breakpoints(w: Wave | undefined, tstop: number): number[] {
  const out: number[] = [];
  if (!w) return out;
  if (w.type === 'pulse') {
    const { td, tr, tf, pw, per } = w;
    for (let k = 0; ; k++) {
      const base = td + k * (per > 0 ? per : 0);
      if (base > tstop) break;
      for (const t of [base, base + tr, base + tr + pw, base + tr + pw + tf]) if (t <= tstop) out.push(t);
      if (!(per > 0) || k > 100000) break;
    }
  } else if (w.type === 'pwl') {
    for (const [t] of w.pts) if (t <= tstop) out.push(t);
  } else if (w.type === 'sin' && (w.td ?? 0) > 0) out.push(w.td!);
  return out;
}
