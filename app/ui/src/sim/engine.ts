// Circuit simulation engine (SIM-01): modified nodal analysis with Newton–Raphson for the
// non-linear devices. The device equations follow SPICE (ngspice) closely, including its
// junction-voltage limiting and the conductance GMIN across every junction, so that results
// agree with ngspice on the reference suite (SIM-04).
//
// Analyses: DC operating point (with GMIN and source stepping as convergence aids), DC sweep,
// transient (trapezoidal integration, backward Euler after each source corner), AC small
// signal around the operating point.

import { breakpoints, opValue, terminals, waveAt, type BjtModel, type Circuit, type DiodeModel, type Element, type MosModel } from './circuit';
import { solveComplex, solveReal } from './linalg';

/** Thermal voltage kT/q at 27 °C, the SPICE default temperature. */
export const VT = (1.38064852e-23 * 300.15) / 1.6021766208e-19;
export const GMIN = 1e-12;
/** Shunt conductance from every node to ground, so a node held only by capacitors still solves.
 *  The SPICE export sets the same value (.option rshunt). */
export const GSHUNT = 1e-12;
const RELTOL = 1e-3, VNTOL = 1e-6, ABSTOL = 1e-12;
const MAX_EXP = 80;

export class SimError extends Error {}

interface Ctx {
  A: Float64Array; z: Float64Array; x: Float64Array; n: number;
  mode: 'dc' | 'tran';
  t: number; h: number; method: 'be' | 'trap';
  srcScale: number;
  gshunt: number;
  init: boolean;
  noncon: boolean;
}

interface AcCtx { Ar: Float64Array; Ai: Float64Array; br: Float64Array; bi: Float64Array; n: number; w: number }

function add(c: { A: Float64Array; n: number }, i: number, j: number, v: number) { if (i >= 0 && j >= 0) c.A[i * c.n + j] += v; }
function addc(c: AcCtx, i: number, j: number, re: number, im: number) { if (i >= 0 && j >= 0) { c.Ar[i * c.n + j] += re; c.Ai[i * c.n + j] += im; } }
function rhs(c: { z: Float64Array }, i: number, v: number) { if (i >= 0) c.z[i] += v; }
const V = (x: Float64Array, i: number) => (i >= 0 ? x[i] : 0);
const Vc = (re: Float64Array, im: Float64Array, i: number): [number, number] => (i >= 0 ? [re[i], im[i]] : [0, 0]);

/** Conductance g between nodes a and b. */
function stampG(c: { A: Float64Array; n: number }, a: number, b: number, g: number) {
  add(c, a, a, g); add(c, b, b, g); add(c, a, b, -g); add(c, b, a, -g);
}
function stampGc(c: AcCtx, a: number, b: number, re: number, im: number) {
  addc(c, a, a, re, im); addc(c, b, b, re, im); addc(c, a, b, -re, -im); addc(c, b, a, -re, -im);
}
/** Linearised current i0 + g·(vab − v0) flowing from a to b through a device. */
function stampJ(c: Ctx, a: number, b: number, i0: number, g: number, v0: number) {
  stampG(c, a, b, g);
  const ieq = i0 - g * v0;
  rhs(c, a, -ieq); rhs(c, b, ieq);
}

/** SPICE pn-junction voltage limiting (DEVpnjlim). */
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number, ctx: Ctx): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > vt + vt) {
    ctx.noncon = true;
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  if (vnew < 0) {
    const arg = vold > 0 ? -1 * vold - 1 : 2 * vold - 1;
    if (vnew < arg) { ctx.noncon = true; return arg; }
  }
  return vnew;
}

/** SPICE FET gate-voltage limiting (DEVfetlim). */
function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2, vtstlo = vtsthi / 2 + 2, vtox = vto + 3.5, delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) { if (-delv > vtstlo) vnew = vold - vtstlo; } else vnew = Math.max(vnew, vto + 2);
      } else if (delv >= vtsthi) vnew = vold + vtsthi;
    } else if (delv <= 0) vnew = Math.max(vnew, vto - 0.5);
    else vnew = Math.min(vnew, vto + 4);
  } else if (delv <= 0) {
    if (-delv > vtsthi) vnew = vold - vtsthi;
  } else {
    const vtemp = vto + 0.5;
    if (vnew <= vtemp) { if (delv > vtstlo) vnew = vold + vtstlo; } else vnew = vtemp;
  }
  return vnew;
}

/** SPICE drain-source voltage limiting (DEVlimvds). */
function limvds(vnew: number, vold: number): number {
  if (vold >= 3.5) {
    if (vnew > vold) vnew = Math.min(vnew, 3 * vold + 2);
    else if (vnew < 3.5) vnew = Math.max(vnew, 2);
  } else if (vnew > vold) vnew = Math.min(vnew, 4);
  else vnew = Math.max(vnew, -0.5);
  return vnew;
}

const exp = (v: number) => Math.exp(Math.min(v, MAX_EXP));

interface Device {
  el: Element;
  load(c: Ctx): void;
  /** Called with the solution of an accepted time point (or of the operating point). */
  accept?(c: Ctx, x: Float64Array): void;
  initTran?(x: Float64Array): void;
  loadAC?(c: AcCtx): void;
  /** Current flowing into the device at each terminal (order of `terminals`). */
  currents(x: Float64Array, c: Ctx | null): number[];
  acCurrents?(re: Float64Array, im: Float64Array, w: number): [number, number][];
  /** SPICE device convergence test: the linearised current agrees with the exact one at x. */
  converged?(x: Float64Array): boolean;
}

const near = (a: number, b: number) => Math.abs(a - b) <= RELTOL * Math.max(Math.abs(a), Math.abs(b)) + ABSTOL;

class Resistor implements Device {
  constructor(public el: Element & { kind: 'R' }, private a: number, private b: number) {}
  get g() { return 1 / Math.max(this.el.r, 1e-12); }
  load(c: Ctx) { stampG(c, this.a, this.b, this.g); }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, this.g, 0); }
  currents(x: Float64Array) { const i = (V(x, this.a) - V(x, this.b)) * this.g; return [i, -i]; }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [ar, ai] = Vc(re, im, this.a), [br, bi] = Vc(re, im, this.b);
    const r = (ar - br) * this.g, i = (ai - bi) * this.g;
    return [[r, i], [-r, -i]] as [number, number][];
  }
}

class Capacitor implements Device {
  vprev = 0; iprev = 0; inow = 0;
  constructor(public el: Element & { kind: 'C' }, private a: number, private b: number) {}
  private comp(c: Ctx): [number, number] {
    const C = this.el.c;
    if (c.method === 'be') { const g = C / c.h; return [g, g * this.vprev]; }
    const g = (2 * C) / c.h; return [g, g * this.vprev + this.iprev];
  }
  load(c: Ctx) {
    if (c.mode === 'dc') return;
    const [g, ieq] = this.comp(c); // i = g·v − ieq
    stampG(c, this.a, this.b, g);
    rhs(c, this.a, ieq); rhs(c, this.b, -ieq);
  }
  initTran(x: Float64Array) { this.vprev = V(x, this.a) - V(x, this.b); this.iprev = 0; this.inow = 0; }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode === 'dc') { this.inow = 0; return; }
    const v = V(x, this.a) - V(x, this.b);
    const [g, ieq] = this.comp(c);
    this.inow = g * v - ieq;
    this.vprev = v; this.iprev = this.inow;
  }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, 0, c.w * this.el.c); }
  currents() { return [this.inow, -this.inow]; }
  acCurrents(re: Float64Array, im: Float64Array, w: number) {
    const [ar, ai] = Vc(re, im, this.a), [br, bi] = Vc(re, im, this.b);
    const vr = ar - br, vi = ai - bi, y = w * this.el.c;
    return [[-y * vi, y * vr], [y * vi, -y * vr]] as [number, number][];
  }
}

/** Elements with a branch current unknown: voltage sources, VCVS, inductors. */
abstract class Branch implements Device {
  abstract el: Element;
  constructor(protected p: number, protected q: number, protected k: number) {}
  protected stampBranch(c: { A: Float64Array; n: number }) {
    add(c, this.p, this.k, 1); add(c, this.q, this.k, -1);
    add(c, this.k, this.p, 1); add(c, this.k, this.q, -1);
  }
  abstract load(c: Ctx): void;
  currents(x: Float64Array) { return [x[this.k], -x[this.k]]; }
  acCurrents(re: Float64Array, im: Float64Array) { return [[re[this.k], im[this.k]], [-re[this.k], -im[this.k]]] as [number, number][]; }
}

class VSource extends Branch {
  constructor(public el: Element & { kind: 'V' }, p: number, q: number, k: number) { super(p, q, k); }
  value(c: Ctx) {
    const e = this.el;
    return (c.mode === 'dc' ? (c.t > 0 ? waveAt(e.dc, e.wave, c.t) : opValue(e.dc, e.wave)) : waveAt(e.dc, e.wave, c.t)) * c.srcScale;
  }
  load(c: Ctx) { this.stampBranch(c); rhs(c, this.k, this.value(c)); }
  loadAC(c: AcCtx) {
    addc(c, this.p, this.k, 1, 0); addc(c, this.q, this.k, -1, 0); addc(c, this.k, this.p, 1, 0); addc(c, this.k, this.q, -1, 0);
    const m = this.el.acMag ?? 0, ph = ((this.el.acPhase ?? 0) * Math.PI) / 180;
    c.br[this.k] += m * Math.cos(ph); c.bi[this.k] += m * Math.sin(ph);
  }
}

class Vcvs extends Branch {
  constructor(public el: Element & { kind: 'E' }, p: number, q: number, private cp: number, private cn: number, k: number) { super(p, q, k); }
  load(c: Ctx) { this.stampBranch(c); add(c, this.k, this.cp, -this.el.gain); add(c, this.k, this.cn, this.el.gain); }
  loadAC(c: AcCtx) {
    addc(c, this.p, this.k, 1, 0); addc(c, this.q, this.k, -1, 0); addc(c, this.k, this.p, 1, 0); addc(c, this.k, this.q, -1, 0);
    addc(c, this.k, this.cp, -this.el.gain, 0); addc(c, this.k, this.cn, this.el.gain, 0);
  }
  currents(x: Float64Array) { return [x[this.k], -x[this.k], 0, 0]; }
  acCurrents(re: Float64Array, im: Float64Array) { return [[re[this.k], im[this.k]], [-re[this.k], -im[this.k]], [0, 0], [0, 0]] as [number, number][]; }
}

class Inductor extends Branch {
  iprev = 0; vprev = 0;
  constructor(public el: Element & { kind: 'L' }, p: number, q: number, k: number) { super(p, q, k); }
  load(c: Ctx) {
    this.stampBranch(c);
    if (c.mode === 'dc') return;
    const L = this.el.l;
    if (c.method === 'be') { const r = L / c.h; add(c, this.k, this.k, -r); rhs(c, this.k, -r * this.iprev); }
    else { const r = (2 * L) / c.h; add(c, this.k, this.k, -r); rhs(c, this.k, -r * this.iprev - this.vprev); }
  }
  initTran(x: Float64Array) { this.iprev = x[this.k]; this.vprev = 0; }
  accept(c: Ctx, x: Float64Array) { if (c.mode === 'tran') { this.iprev = x[this.k]; this.vprev = V(x, this.p) - V(x, this.q); } }
  loadAC(c: AcCtx) {
    addc(c, this.p, this.k, 1, 0); addc(c, this.q, this.k, -1, 0); addc(c, this.k, this.p, 1, 0); addc(c, this.k, this.q, -1, 0);
    addc(c, this.k, this.k, 0, -c.w * this.el.l);
  }
}

class ISource implements Device {
  constructor(public el: Element & { kind: 'I' }, private p: number, private q: number) {}
  value(c: Ctx) {
    const e = this.el;
    return (c.mode === 'dc' ? (c.t > 0 ? waveAt(e.dc, e.wave, c.t) : opValue(e.dc, e.wave)) : waveAt(e.dc, e.wave, c.t)) * c.srcScale;
  }
  last = 0;
  load(c: Ctx) { const i = this.value(c); this.last = i; rhs(c, this.p, -i); rhs(c, this.q, i); }
  loadAC(c: AcCtx) {
    const m = this.el.acMag ?? 0, ph = ((this.el.acPhase ?? 0) * Math.PI) / 180;
    const r = m * Math.cos(ph), i = m * Math.sin(ph);
    if (this.p >= 0) { c.br[this.p] -= r; c.bi[this.p] -= i; }
    if (this.q >= 0) { c.br[this.q] += r; c.bi[this.q] += i; }
  }
  currents() { return [this.last, -this.last]; }
  acCurrents() {
    const m = this.el.acMag ?? 0, ph = ((this.el.acPhase ?? 0) * Math.PI) / 180;
    return [[m * Math.cos(ph), m * Math.sin(ph)], [-m * Math.cos(ph), -m * Math.sin(ph)]] as [number, number][];
  }
}

class Vccs implements Device {
  constructor(public el: Element & { kind: 'G' }, private p: number, private q: number, private cp: number, private cn: number) {}
  load(c: Ctx) {
    const g = this.el.gm;
    add(c, this.p, this.cp, g); add(c, this.p, this.cn, -g); add(c, this.q, this.cp, -g); add(c, this.q, this.cn, g);
  }
  loadAC(c: AcCtx) {
    const g = this.el.gm;
    addc(c, this.p, this.cp, g, 0); addc(c, this.p, this.cn, -g, 0); addc(c, this.q, this.cp, -g, 0); addc(c, this.q, this.cn, g, 0);
  }
  currents(x: Float64Array) { const i = this.el.gm * (V(x, this.cp) - V(x, this.cn)); return [i, -i, 0, 0]; }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [a, b] = Vc(re, im, this.cp), [c2, d] = Vc(re, im, this.cn);
    const r = this.el.gm * (a - c2), i = this.el.gm * (b - d);
    return [[r, i], [-r, -i], [0, 0], [0, 0]] as [number, number][];
  }
}

/** Breakdown voltage adjusted so that the reverse current at −BV equals IBV (as in SPICE). */
function breakdownVoltage(m: DiodeModel, vt: number): number | undefined {
  if (!m.bv) return undefined;
  const ibv = m.ibv ?? 1e-3;
  const cbv = ibv;
  if (cbv < (m.is * m.bv) / vt) return m.bv;
  const tol = RELTOL * cbv;
  let xbv = m.bv - vt * Math.log(1 + cbv / m.is);
  for (let i = 0; i < 25; i++) {
    xbv = m.bv - vt * Math.log(cbv / m.is + 1 - xbv / vt);
    const xcbv = m.is * (Math.exp((m.bv - xbv) / vt) - 1 + xbv / vt);
    if (Math.abs(xcbv - cbv) <= tol) break;
  }
  return xbv;
}

class Diode implements Device {
  vd = 0; gd = 0; cd = 0;
  private vte: number; private vcrit: number; private tbv?: number;
  constructor(public el: Element & { kind: 'D' }, private a: number, private ai: number, private k: number) {
    const m = el.model;
    this.vte = m.n * VT;
    this.vcrit = this.vte * Math.log(this.vte / (Math.SQRT2 * m.is));
    this.tbv = breakdownVoltage(m, this.vte);
  }
  private eval(vd: number): [number, number] {
    const { is } = this.el.model, vte = this.vte;
    if (vd >= -3 * vte) { const e = exp(vd / vte); return [is * (e - 1) + GMIN * vd, (is * e) / vte + GMIN]; }
    if (this.tbv === undefined || vd >= -this.tbv) {
      let arg = (3 * vte) / (vd * Math.E); arg = arg * arg * arg;
      return [-is * (1 + arg) + GMIN * vd, (is * 3 * arg) / vd + GMIN];
    }
    const ev = exp(-(this.tbv + vd) / vte);
    return [-is * ev + GMIN * vd, (is * ev) / vte + GMIN];
  }
  load(c: Ctx) {
    if (this.ai !== this.a) stampG(c, this.a, this.ai, 1 / this.el.model.rs);
    let vd = V(c.x, this.ai) - V(c.x, this.k);
    if (c.init) vd = this.vcrit;
    else {
      if (this.tbv !== undefined && vd < Math.min(0, -this.tbv + 10 * this.vte)) {
        // limit in breakdown as SPICE does, mirrored around −BV
        const vdtemp = pnjlim(-(vd + this.tbv), -(this.vd + this.tbv), this.vte, this.vcrit, c);
        vd = -(vdtemp + this.tbv);
      } else vd = pnjlim(vd, this.vd, this.vte, this.vcrit, c);
    }
    const [cd, gd] = this.eval(vd);
    this.vd = vd; this.cd = cd; this.gd = gd;
    stampJ(c, this.ai, this.k, cd, gd, vd);
  }
  loadAC(c: AcCtx) {
    if (this.ai !== this.a) stampGc(c, this.a, this.ai, 1 / this.el.model.rs, 0);
    stampGc(c, this.ai, this.k, this.gd, 0);
  }
  currents(x: Float64Array) {
    const [i] = this.eval(V(x, this.ai) - V(x, this.k));
    return [i, -i];
  }
  converged(x: Float64Array) {
    const vd = V(x, this.ai) - V(x, this.k);
    return near(this.eval(vd)[0], this.cd + this.gd * (vd - this.vd));
  }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [ar, ai] = Vc(re, im, this.ai), [kr, ki] = Vc(re, im, this.k);
    const r = this.gd * (ar - kr), i = this.gd * (ai - ki);
    return [[r, i], [-r, -i]] as [number, number][];
  }
}

class Bjt implements Device {
  vbe = 0; vbc = 0;
  // small-signal partial derivatives at the last evaluation
  private d = { cc: 0, cb: 0, ccBe: 0, ccBc: 0, cbBe: 0, cbBc: 0 };
  private sgn: number; private vcritF: number; private vcritR: number;
  constructor(public el: Element & { kind: 'Q' }, private c: number, private b: number, private e: number) {
    const m = el.model;
    this.sgn = m.type === 'npn' ? 1 : -1;
    this.vcritF = m.nf * VT * Math.log((m.nf * VT) / (Math.SQRT2 * m.is));
    this.vcritR = m.nr * VT * Math.log((m.nr * VT) / (Math.SQRT2 * m.is));
  }
  private eval(vbe: number, vbc: number) {
    const m: BjtModel = this.el.model;
    const vtf = m.nf * VT, vtr = m.nr * VT;
    const ebe = exp(vbe / vtf), ebc = exp(vbc / vtr);
    const cbe = m.is * (ebe - 1) + GMIN * vbe, gbe = (m.is * ebe) / vtf + GMIN;
    const cbc = m.is * (ebc - 1) + GMIN * vbc, gbc = (m.is * ebc) / vtr + GMIN;
    const ivaf = m.vaf ? 1 / m.vaf : 0, ivar = m.var ? 1 / m.var : 0;
    const D = 1 - ivaf * vbc - ivar * vbe; // 1/qb
    const cc = (cbe - cbc) * D - cbc / m.br;
    const cb = cbe / m.bf + cbc / m.br;
    return {
      cc, cb,
      ccBe: gbe * D - (cbe - cbc) * ivar,
      ccBc: -gbc * D - (cbe - cbc) * ivaf - gbc / m.br,
      cbBe: gbe / m.bf,
      cbBc: gbc / m.br,
    };
  }
  load(c: Ctx) {
    const s = this.sgn, x = c.x;
    let vbe = s * (V(x, this.b) - V(x, this.e)), vbc = s * (V(x, this.b) - V(x, this.c));
    if (c.init) { vbe = this.vcritF; vbc = 0; }
    else {
      vbe = pnjlim(vbe, this.vbe, this.el.model.nf * VT, this.vcritF, c);
      vbc = pnjlim(vbc, this.vbc, this.el.model.nr * VT, this.vcritR, c);
    }
    this.vbe = vbe; this.vbc = vbc;
    const r = this.eval(vbe, vbc);
    this.d = r;
    // Ic = s·(cc + ccBe·(vbe' − vbe) + ccBc·(vbc' − vbc)) with vbe' = s·(vb − ve), vbc' = s·(vb − vc)
    const stampT = (t: number, i0: number, gBe: number, gBc: number) => {
      add(c, t, this.b, gBe + gBc); add(c, t, this.e, -gBe); add(c, t, this.c, -gBc);
      rhs(c, t, -s * (i0 - gBe * vbe - gBc * vbc));
    };
    stampT(this.c, r.cc, r.ccBe, r.ccBc);
    stampT(this.b, r.cb, r.cbBe, r.cbBc);
    stampT(this.e, -(r.cc + r.cb), -(r.ccBe + r.cbBe), -(r.ccBc + r.cbBc));
  }
  converged(x: Float64Array) {
    const s = this.sgn, r = this.d;
    const vbe = s * (V(x, this.b) - V(x, this.e)), vbc = s * (V(x, this.b) - V(x, this.c));
    const ex = this.eval(vbe, vbc), dbe = vbe - this.vbe, dbc = vbc - this.vbc;
    return near(ex.cc, r.cc + r.ccBe * dbe + r.ccBc * dbc) && near(ex.cb, r.cb + r.cbBe * dbe + r.cbBc * dbc);
  }
  loadAC(c: AcCtx) {
    const r = this.d;
    const st = (t: number, gBe: number, gBc: number) => { addc(c, t, this.b, gBe + gBc, 0); addc(c, t, this.e, -gBe, 0); addc(c, t, this.c, -gBc, 0); };
    st(this.c, r.ccBe, r.ccBc); st(this.b, r.cbBe, r.cbBc); st(this.e, -(r.ccBe + r.cbBe), -(r.ccBc + r.cbBc));
  }
  currents(x: Float64Array) {
    const s = this.sgn;
    const r = this.eval(s * (V(x, this.b) - V(x, this.e)), s * (V(x, this.b) - V(x, this.c)));
    return [s * r.cc, s * r.cb, -s * (r.cc + r.cb)];
  }
  acCurrents(re: Float64Array, im: Float64Array) {
    const r = this.d;
    const [br, bi] = Vc(re, im, this.b), [er, ei] = Vc(re, im, this.e), [cr, ci] = Vc(re, im, this.c);
    const be: [number, number] = [br - er, bi - ei], bc: [number, number] = [br - cr, bi - ci];
    const ic: [number, number] = [r.ccBe * be[0] + r.ccBc * bc[0], r.ccBe * be[1] + r.ccBc * bc[1]];
    const ib: [number, number] = [r.cbBe * be[0] + r.cbBc * bc[0], r.cbBe * be[1] + r.cbBc * bc[1]];
    return [ic, ib, [-(ic[0] + ib[0]), -(ic[1] + ib[1])]] as [number, number][];
  }
}

class Mosfet implements Device {
  vgs = 0; vds = 0; vbd = 0;
  private sgn: number; private von: number; private beta: number; private vcrit: number;
  private ss = { gm: 0, gds: 0, rev: false, gbd: 0, cd: 0 };
  constructor(public el: Element & { kind: 'M' }, private d: number, private g: number, private s: number) {
    const m: MosModel = el.model;
    this.sgn = m.type === 'nmos' ? 1 : -1;
    this.von = this.sgn * m.vto;
    this.beta = (m.kp * m.w) / m.l;
    this.vcrit = VT * Math.log(VT / (Math.SQRT2 * m.is));
  }
  /** Level-1 drain current for vds ≥ 0. */
  private ids(vgs: number, vds: number): [number, number, number] {
    const vgst = vgs - this.von, lam = this.el.model.lambda, beta = this.beta;
    if (vgst <= 0) return [0, 0, 0];
    const betap = beta * (1 + lam * vds);
    if (vgst <= vds) return [(betap * vgst * vgst) / 2, betap * vgst, (lam * beta * vgst * vgst) / 2];
    return [betap * vds * (vgst - vds / 2), betap * vds, betap * (vgst - vds) + lam * beta * vds * (vgst - vds / 2)];
  }
  private bodyDiode(vbd: number): [number, number] {
    const is = this.el.model.is;
    if (vbd <= -3 * VT) return [GMIN * vbd - is, GMIN];
    const e = exp(vbd / VT);
    return [is * (e - 1) + GMIN * vbd, (is * e) / VT + GMIN];
  }
  load(c: Ctx) {
    const s = this.sgn, x = c.x;
    let vgs = s * (V(x, this.g) - V(x, this.s)), vds = s * (V(x, this.d) - V(x, this.s));
    let vbd = s * (V(x, this.s) - V(x, this.d));
    if (c.init) { vgs = this.von; vds = 0; vbd = 0; }
    else {
      let vgd = vgs - vds;
      const vgdo = this.vgs - this.vds;
      const lv = [vgs, vds];
      if (this.vds >= 0) {
        vgs = fetlim(vgs, this.vgs, this.von); vds = vgs - vgd; vds = limvds(vds, this.vds); vgd = vgs - vds;
      } else {
        vgd = fetlim(vgd, vgdo, this.von); vds = vgs - vgd; vds = -limvds(-vds, -this.vds); vgs = vgd + vds;
      }
      if (Math.abs(lv[0] - vgs) > 1e-12 || Math.abs(lv[1] - vds) > 1e-12) c.noncon = true;
      vbd = pnjlim(vbd, this.vbd, VT, this.vcrit, c);
    }
    this.vgs = vgs; this.vds = vds; this.vbd = vbd;
    const g = this.g, d = this.d, src = this.s;
    if (vds >= 0) {
      const [cd, gm, gds] = this.ids(vgs, vds);
      this.ss = { gm, gds, rev: false, gbd: 0, cd };
      add(c, d, g, gm); add(c, d, src, -(gm + gds)); add(c, d, d, gds);
      add(c, src, g, -gm); add(c, src, src, gm + gds); add(c, src, d, -gds);
      const i0 = s * (cd - gm * vgs - gds * vds);
      rhs(c, d, -i0); rhs(c, src, i0);
    } else {
      const vgd = vgs - vds, vsd = -vds;
      const [cd, gm, gds] = this.ids(vgd, vsd);
      this.ss = { gm, gds, rev: true, gbd: 0, cd };
      // Id = −s·(cd + gm·(vgd' − vgd) + gds·(vsd' − vsd)), vgd' = s(vg − vd), vsd' = s(vs − vd)
      add(c, d, g, -gm); add(c, d, d, gm + gds); add(c, d, src, -gds);
      add(c, src, g, gm); add(c, src, d, -(gm + gds)); add(c, src, src, gds);
      const i0 = -s * (cd - gm * vgd - gds * vsd);
      rhs(c, d, -i0); rhs(c, src, i0);
    }
    // body diode: bulk (= source) to drain
    const [cbd, gbd] = this.bodyDiode(vbd);
    this.ss.gbd = gbd;
    stampG(c, src, d, gbd);
    const ieq = s * (cbd - gbd * vbd);
    rhs(c, src, -ieq); rhs(c, d, ieq);
  }
  converged(x: Float64Array) {
    const sg = this.sgn, { gm, gds, rev, cd } = this.ss;
    const vgs = sg * (V(x, this.g) - V(x, this.s)), vds = sg * (V(x, this.d) - V(x, this.s));
    if (!rev) {
      if (vds < 0) return false;
      return near(this.ids(vgs, vds)[0], cd + gm * (vgs - this.vgs) + gds * (vds - this.vds));
    }
    if (vds >= 0) return false;
    return near(this.ids(vgs - vds, -vds)[0], cd + gm * (vgs - vds - (this.vgs - this.vds)) + gds * (-vds + this.vds));
  }
  loadAC(c: AcCtx) {
    const { gm, gds, rev, gbd } = this.ss, g = this.g, d = this.d, s = this.s;
    if (!rev) {
      addc(c, d, g, gm, 0); addc(c, d, s, -(gm + gds), 0); addc(c, d, d, gds, 0);
      addc(c, s, g, -gm, 0); addc(c, s, s, gm + gds, 0); addc(c, s, d, -gds, 0);
    } else {
      addc(c, d, g, -gm, 0); addc(c, d, d, gm + gds, 0); addc(c, d, s, -gds, 0);
      addc(c, s, g, gm, 0); addc(c, s, d, -(gm + gds), 0); addc(c, s, s, gds, 0);
    }
    stampGc(c, s, d, gbd, 0);
  }
  currents(x: Float64Array) {
    const sg = this.sgn;
    const vgs = sg * (V(x, this.g) - V(x, this.s)), vds = sg * (V(x, this.d) - V(x, this.s));
    let id = vds >= 0 ? sg * this.ids(vgs, vds)[0] : -sg * this.ids(vgs - vds, -vds)[0];
    const [cbd] = this.bodyDiode(sg * (V(x, this.s) - V(x, this.d)));
    id -= sg * cbd;
    return [id, 0, -id];
  }
  acCurrents(re: Float64Array, im: Float64Array) {
    const { gm, gds, rev, gbd } = this.ss;
    const [gr, gi] = Vc(re, im, this.g), [dr, di] = Vc(re, im, this.d), [sr, si] = Vc(re, im, this.s);
    let r: number, i: number;
    if (!rev) { r = gm * (gr - sr) + gds * (dr - sr); i = gm * (gi - si) + gds * (di - si); }
    else { r = -(gm * (gr - dr) + gds * (sr - dr)); i = -(gm * (gi - di) + gds * (si - di)); }
    r -= gbd * (sr - dr); i -= gbd * (si - di);
    return [[r, i], [0, 0], [-r, -i]] as [number, number][];
  }
}

export interface Waveforms {
  /** Sweep variable: time (s), frequency (Hz) or the swept value. */
  x: number[];
  /** Node voltages (real part for AC). */
  v: Record<string, number[]>;
  /** Terminal currents per element (into the element), per terminal. */
  i: Record<string, number[][]>;
  /** AC only: imaginary parts. */
  vi?: Record<string, number[]>;
  ii?: Record<string, number[][]>;
  warnings: string[];
}

export interface OpResult { v: Record<string, number>; i: Record<string, number[]>; warnings: string[] }

export class Engine {
  readonly nodeIndex = new Map<string, number>();
  /** User-visible node names (internal nodes excluded). */
  readonly nodeNames: string[] = [];
  private devices: Device[] = [];
  private n = 0;
  private nNodes = 0;
  private x: Float64Array = new Float64Array(0);
  private breaks: { wave: Element }[] = [];
  warnings: string[] = [];

  constructor(readonly circuit: Circuit) {
    const node = (name: string, visible = true): number => {
      if (name === '0' || name.toLowerCase() === 'gnd') return -1;
      let i = this.nodeIndex.get(name);
      if (i === undefined) { i = this.nNodes++; this.nodeIndex.set(name, i); if (visible) this.nodeNames.push(name); }
      return i;
    };
    const seen = new Set<string>();
    for (const e of circuit.elements) {
      if (seen.has(e.name)) throw new SimError(`duplicate element name ${e.name}`);
      seen.add(e.name);
      for (const t of terminals(e)) node(t);
    }
    // internal nodes after the visible ones
    const internal: [Element & { kind: 'D' }, number][] = [];
    for (const e of circuit.elements) if (e.kind === 'D' && e.model.rs > 0) internal.push([e, node(`${e.name}#a`, false)]);
    let k = this.nNodes;
    const br = () => k++;
    for (const e of circuit.elements) {
      const ix = (s: string) => node(s);
      switch (e.kind) {
        case 'R': this.devices.push(new Resistor(e, ix(e.a), ix(e.b))); break;
        case 'C': this.devices.push(new Capacitor(e, ix(e.a), ix(e.b))); break;
        case 'L': this.devices.push(new Inductor(e, ix(e.a), ix(e.b), br())); break;
        case 'V': this.devices.push(new VSource(e, ix(e.p), ix(e.n), br())); this.breaks.push({ wave: e }); break;
        case 'I': this.devices.push(new ISource(e, ix(e.p), ix(e.n))); this.breaks.push({ wave: e }); break;
        case 'E': this.devices.push(new Vcvs(e, ix(e.p), ix(e.n), ix(e.cp), ix(e.cn), br())); break;
        case 'G': this.devices.push(new Vccs(e, ix(e.p), ix(e.n), ix(e.cp), ix(e.cn))); break;
        case 'D': {
          const ai = internal.find(([d]) => d === e)?.[1] ?? ix(e.a);
          this.devices.push(new Diode(e, ix(e.a), ai, ix(e.k)));
          break;
        }
        case 'Q': this.devices.push(new Bjt(e, ix(e.c), ix(e.b), ix(e.e))); break;
        case 'M': this.devices.push(new Mosfet(e, ix(e.d), ix(e.g), ix(e.s))); break;
      }
    }
    this.n = k;
    this.x = new Float64Array(this.n);
  }

  get size() { return this.n; }

  private ctx(over: Partial<Ctx>): Ctx {
    return {
      A: new Float64Array(this.n * this.n), z: new Float64Array(this.n), x: this.x, n: this.n,
      mode: 'dc', t: 0, h: 0, method: 'be', srcScale: 1, gshunt: 0, init: false, noncon: false, ...over,
    };
  }

  private assemble(c: Ctx) {
    c.A.fill(0); c.z.fill(0); c.noncon = false;
    for (let i = 0; i < this.nNodes; i++) c.A[i * c.n + i] += GSHUNT + c.gshunt;
    for (const d of this.devices) d.load(c);
  }

  /** Newton–Raphson from c.x; returns the iteration count or −1 when it did not converge. */
  private newton(c: Ctx, maxIter: number, initJct: boolean): number {
    let x = c.x;
    for (let it = 1; it <= maxIter; it++) {
      c.x = x;
      c.init = initJct && it === 1;
      this.assemble(c);
      const b = c.z.slice();
      if (!solveReal(c.A.slice(), b, c.n)) return -1;
      for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) return -1;
      let conv = !c.noncon && !c.init;
      if (conv) {
        for (let i = 0; i < c.n; i++) {
          const tol = RELTOL * Math.max(Math.abs(b[i]), Math.abs(x[i])) + (i < this.nNodes ? VNTOL : ABSTOL);
          if (Math.abs(b[i] - x[i]) > tol) { conv = false; break; }
        }
      }
      if (conv) for (const d of this.devices) if (d.converged && !d.converged(b)) { conv = false; break; }
      x = b;
      c.x = x;
      if (conv && it > 1) {
        // linearise once more at the solution, so small-signal values belong to it (AC)
        this.assemble(c);
        return it;
      }
    }
    return -1;
  }

  /** Operating point with GMIN stepping and source stepping when plain Newton fails. */
  private solveDc(over: Partial<Ctx> = {}, fromScratch = true): Ctx {
    const start = fromScratch ? new Float64Array(this.n) : this.x.slice();
    let c = this.ctx({ ...over, x: start });
    if (this.newton(c, 100, fromScratch) > 0) return c;
    // GMIN stepping
    let x: Float64Array = new Float64Array(this.n);
    let ok = true;
    for (let g = 1e-2; g >= 1e-13; g /= 10) {
      c = this.ctx({ ...over, x, gshunt: g >= 1e-12 ? g : 0 });
      if (this.newton(c, 100, g === 1e-2) < 0) { ok = false; break; }
      x = c.x;
    }
    if (ok) { c = this.ctx({ ...over, x }); if (this.newton(c, 100, false) > 0) { this.warnings.push('operating point found with GMIN stepping'); return c; } }
    // source stepping
    x = new Float64Array(this.n);
    for (let s = 0; s <= 1.0000001; s += 0.05) {
      c = this.ctx({ ...over, x, srcScale: Math.min(s, 1) });
      if (this.newton(c, 200, s === 0) < 0) throw new SimError('no DC operating point found (Newton, GMIN stepping and source stepping failed)');
      x = c.x;
    }
    this.warnings.push('operating point found with source stepping');
    return c;
  }

  private record(c: Ctx, out: Waveforms, xval: number) {
    out.x.push(xval);
    for (const name of this.nodeNames) out.v[name].push(V(c.x, this.nodeIndex.get(name)!));
    for (const d of this.devices) {
      const cur = d.currents(c.x, c);
      const arr = out.i[d.el.name];
      cur.forEach((v, k) => arr[k].push(v));
    }
  }

  private newWaveforms(): Waveforms {
    const out: Waveforms = { x: [], v: {}, i: {}, warnings: this.warnings };
    for (const name of this.nodeNames) out.v[name] = [];
    for (const d of this.devices) out.i[d.el.name] = terminals(d.el).map(() => []);
    return out;
  }

  op(): OpResult {
    this.warnings = [];
    const c = this.solveDc();
    this.x = c.x;
    for (const d of this.devices) d.accept?.(c, c.x);
    const v: Record<string, number> = {};
    for (const name of this.nodeNames) v[name] = V(c.x, this.nodeIndex.get(name)!);
    const i: Record<string, number[]> = {};
    for (const d of this.devices) i[d.el.name] = d.currents(c.x, c);
    return { v, i, warnings: this.warnings };
  }

  /** DC sweep: `set(value)` changes the circuit (a source or a part value) before each point. */
  dcSweep(values: number[], set: (v: number) => void): Waveforms {
    this.warnings = [];
    const out = this.newWaveforms();
    let first = true;
    for (const val of values) {
      set(val);
      const c = this.solveDc({}, first);
      first = false;
      this.x = c.x;
      for (const d of this.devices) d.accept?.(c, c.x);
      this.record(c, out, val);
    }
    return out;
  }

  /** Transient analysis from 0 to tstop; tstep is the output resolution and the largest step. */
  tran(tstep: number, tstop: number, tmax?: number, maxPoints = 200000): Waveforms {
    if (!(tstep > 0 && tstop > 0)) throw new SimError('transient: step and stop time must be > 0');
    this.warnings = [];
    let c = this.solveDc({ t: 0 });
    this.x = c.x;
    for (const d of this.devices) d.initTran?.(c.x);
    const out = this.newWaveforms();
    for (const d of this.devices) d.accept?.(c, c.x);
    this.record(c, out, 0);
    const hmax = Math.min(tmax ?? tstep, tstop / 50);
    const hmin = tstop * 1e-12;
    const bps = new Set<number>([tstop]);
    for (const b of this.breaks) {
      const e = b.wave as Element & { kind: 'V' | 'I' };
      for (const t of breakpoints(e.wave, tstop)) if (t > 0) bps.add(t);
    }
    const sorted = [...bps].sort((a, b) => a - b);
    let bi = 0;
    let t = 0, h = Math.min(hmax, sorted[0]) / 10, afterBreak = true;
    const eps = tstop * 1e-12;
    while (t < tstop - eps) {
      while (bi < sorted.length && sorted[bi] <= t + eps) bi++;
      const nb = sorted[bi] ?? tstop;
      const hh = Math.min(h, nb - t);
      c = this.ctx({ mode: 'tran', t: t + hh, h: hh, method: afterBreak ? 'be' : 'trap', x: this.x });
      const it = this.newton(c, 50, false);
      if (it < 0) {
        h = hh / 8;
        if (h < hmin) throw new SimError(`transient: time step too small at t = ${t.toExponential(3)} s (no convergence)`);
        continue;
      }
      this.x = c.x;
      for (const d of this.devices) d.accept?.(c, c.x);
      t += hh;
      this.record(c, out, t);
      if (out.x.length > maxPoints) throw new SimError(`transient: more than ${maxPoints} time points; use a larger step`);
      afterBreak = Math.abs(t - nb) <= eps;
      h = it <= 6 ? Math.min(hmax, hh * 2) : it > 20 ? hh / 2 : hh;
      if (afterBreak) h = Math.min(h, hmax / 10); // restart small after a source corner
    }
    return out;
  }

  /** AC analysis around the operating point. */
  ac(freqs: number[]): Waveforms {
    this.warnings = [];
    const c = this.solveDc();
    this.x = c.x;
    for (const d of this.devices) d.accept?.(c, c.x);
    const out = this.newWaveforms();
    out.vi = {}; out.ii = {};
    for (const name of this.nodeNames) out.vi[name] = [];
    for (const d of this.devices) out.ii[d.el.name] = terminals(d.el).map(() => []);
    const n = this.n;
    for (const f of freqs) {
      const w = 2 * Math.PI * f;
      const ac: AcCtx = { Ar: new Float64Array(n * n), Ai: new Float64Array(n * n), br: new Float64Array(n), bi: new Float64Array(n), n, w };
      for (let i = 0; i < this.nNodes; i++) ac.Ar[i * n + i] += GSHUNT;
      for (const d of this.devices) d.loadAC?.(ac);
      if (!solveComplex(ac.Ar, ac.Ai, ac.br, ac.bi, n)) throw new SimError(`AC: singular matrix at ${f} Hz`);
      out.x.push(f);
      for (const name of this.nodeNames) {
        const k = this.nodeIndex.get(name)!;
        out.v[name].push(ac.br[k]); out.vi[name].push(ac.bi[k]);
      }
      for (const d of this.devices) {
        const cur = d.acCurrents?.(ac.br, ac.bi, w) ?? terminals(d.el).map(() => [0, 0] as [number, number]);
        cur.forEach(([r, i], k) => { out.i[d.el.name][k].push(r); out.ii![d.el.name][k].push(i); });
      }
    }
    return out;
  }

  /** Element by name, for DC sweeps that change a value in place. */
  element(name: string): Element | undefined {
    return this.devices.find((d) => d.el.name === name)?.el;
  }
}

/** Logarithmic frequency points, `perDecade` per decade, SPICE ".ac dec" style. */
export function decadePoints(fstart: number, fstop: number, perDecade: number): number[] {
  const out: number[] = [];
  const n = Math.max(1, Math.round(Math.log10(fstop / fstart) * perDecade));
  for (let i = 0; i <= n; i++) out.push(fstart * Math.pow(10, i / perDecade));
  return out.filter((f) => f <= fstop * (1 + 1e-9));
}

/** Linear sweep points from start to stop (inclusive) with the given step. */
export function linearPoints(start: number, stop: number, step: number): number[] {
  if (!(Math.abs(step) > 0)) throw new SimError('sweep step must not be 0');
  const s = (stop - start) * step < 0 ? -step : step;
  const n = Math.floor((stop - start) / s + 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(start + i * s);
  return out;
}
