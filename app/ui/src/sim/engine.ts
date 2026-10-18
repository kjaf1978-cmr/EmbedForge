// Circuit simulation engine (SIM-01): modified nodal analysis with Newton–Raphson for the
// non-linear devices. The device equations follow SPICE (ngspice) closely, including its
// junction-voltage limiting and the conductance GMIN across every junction, so that results
// agree with ngspice on the reference suite (SIM-04).
//
// Analyses: DC operating point (with GMIN and source stepping as convergence aids), DC sweep,
// transient (trapezoidal integration, backward Euler after each source corner), AC small
// signal around the operating point.

import { breakpoints, opValue, terminals, waveAt, type BjtModel, type Circuit, type DiodeModel, type Element, type MosModel } from './circuit';
import { minDegreeOrder, solveComplex, SparseSolver } from './linalg';

/** Nominal temperature in kelvin (27 °C, SPICE TNOM): model parameters are given at it. */
export const TNOM = 300.15;
/** Thermal voltage kT/q at the absolute temperature tk. */
export const thermalVoltage = (tk: number) => (1.38064852e-23 * tk) / 1.6021766208e-19;
/** Thermal voltage at 27 °C, the SPICE default temperature. */
export const VT = thermalVoltage(TNOM);

/** Band gap of silicon in eV at tk (SPICE's fit, used for the MOSFET's temperature shifts). */
const egSi = (tk: number) => 1.16 - (7.02e-4 * tk * tk) / (tk + 1108);

/** Junction saturation current at tk (SPICE diotemp/bjttemp):
 *    IS(T) = IS·exp((T/TNOM − 1)·EG/(N·V_T(T)) + (XTI/N)·ln(T/TNOM))
 *  with the band gap EG = 1.11 eV and XTI = 3 unless the model sets them. A bipolar transistor
 *  uses N = 1 here, as SPICE does. IS roughly doubles every 5 K, so a diode's forward voltage
 *  at a fixed current falls by about 2 mV/K. */
export function satCurrent(is: number, n: number, tk: number, xti = 3, eg = 1.11): number {
  const r = tk / TNOM;
  return is * Math.exp(((r - 1) * eg) / (n * thermalVoltage(tk)) + (xti / n) * Math.log(r));
}

/** Level-1 MOSFET parameters at tk (SPICE mos1temp with GAMMA = 0 and PHI = 0.6 V):
 *  KP falls as (T/TNOM)^−1.5 (carrier mobility); the threshold follows the band gap and the
 *  surface potential, VTO(T) = VTO + ½·(EG(TNOM) − EG(T)) + type·½·(PHI(T) − PHI), about
 *  −1 mV/K for an n-channel device; the body diode's IS follows exp(EG(TNOM)/V_T(TNOM) − EG(T)/V_T(T)). */
export function mosAtTemp(m: MosModel, tk: number): { vto: number; kp: number; is: number } {
  const vt = thermalVoltage(tk), phi = 0.6, type = m.type === 'nmos' ? 1 : -1;
  const eg = egSi(tk), eg1 = egSi(TNOM), r = tk / TNOM, fact2 = tk / TNOM;
  const pbfact = -2 * vt * (1.5 * Math.log(fact2) - eg / (2 * vt) + 1.1150877 / (2 * VT));
  const pbfact1 = -2 * VT * (-eg1 / (2 * VT) + 1.1150877 / (2 * VT));
  const tphi = fact2 * (phi - pbfact1) + pbfact;
  return {
    vto: m.vto + 0.5 * (eg1 - eg) + type * 0.5 * (tphi - phi),
    kp: m.kp / (r * Math.sqrt(r)),
    is: m.is * Math.exp(-eg / vt + eg1 / VT),
  };
}
export const GMIN = 1e-12;
/** Shunt conductance from every node to ground, so a node held only by capacitors still solves.
 *  The SPICE export sets the same value (.option rshunt). */
export const GSHUNT = 1e-12;
const RELTOL = 1e-3, VNTOL = 1e-6, ABSTOL = 1e-12;
/** SPICE truncation-error tolerance factor and charge tolerance. */
const TRTOL = 7, CHGTOL = 1e-14;

/** Local truncation error control (SPICE CKTterr): the largest step for which the
 *  integration error of a state q (charge or flux) stays within tolerance. `hist` holds the
 *  last accepted (t, q); `tol` is the allowed error rate (current for a charge, voltage for a
 *  flux). Trapezoidal steps use the third divided difference, backward Euler the second. */
function lteStep(hist: [number, number][], t: number, q: number, h: number, method: 'be' | 'trap', tol: number): number {
  const pts = [...hist, [t, q] as [number, number]];
  const need = method === 'trap' ? 4 : 3;
  if (pts.length < need) return Infinity;
  const p = pts.slice(-need);
  // divided differences
  let d = p.map(([, y]) => y);
  for (let o = 1; o < need; o++) d = d.slice(1).map((v, k) => (v - d[k]) / (p[k + o][0] - p[k][0]));
  const dd = Math.abs(d[0]);
  // error of the step: trap ≈ h³·q'''/12 = h³·dd/2, BE ≈ h²·q''/2 = h²·dd
  const err = method === 'trap' ? (h ** 3 * dd) / 2 : h ** 2 * dd;
  const allowed = TRTOL * tol * h;
  if (!(err > 0)) return Infinity;
  return method === 'trap' ? h * Math.sqrt(allowed / err) : (h * allowed) / err;
}
const MAX_EXP = 80;

export class SimError extends Error {
  /** The waveforms computed before a transient failed (to see what led to it). */
  partial?: Waveforms;
}

/** The positions of the matrix that any device has ever written (index i·n + j), so the matrix
 *  is cleared and handed to the solver by its non-zeros instead of all n² entries. */
export interface Pattern { mark: Uint8Array; list: Int32Array; len: number }

interface Ctx {
  A: Float64Array; z: Float64Array; x: Float64Array; n: number;
  pat?: Pattern;
  mode: 'dc' | 'tran';
  t: number; h: number; method: 'be' | 'trap';
  srcScale: number;
  gshunt: number;
  init: boolean;
  noncon: boolean;
  /** Transient start without an operating point: capacitors at 0 V, inductors at 0 A (SPICE uic). */
  uic: boolean;
}

interface AcCtx { Ar: Float64Array; Ai: Float64Array; br: Float64Array; bi: Float64Array; n: number; w: number }

function add(c: { A: Float64Array; n: number; pat?: Pattern }, i: number, j: number, v: number) {
  if (i < 0 || j < 0) return;
  const k = i * c.n + j;
  c.A[k] += v;
  const p = c.pat;
  if (p !== undefined && p.mark[k] === 0) { p.mark[k] = 1; p.list[p.len++] = k; }
}
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
  /** Largest step the integration error allows at the candidate solution x (reactive devices). */
  lte?(x: Float64Array, c: Ctx): number;
  /** Forgets the state history (after a breakpoint the derivatives jump). */
  resetHistory?(): void;
  /** Trapezoidal ringing: the current has flipped sign at a similar size on the last steps
   *  (a stiff loop the step has outgrown); the next step is then a backward-Euler one. */
  rings?(): boolean;
  /** Devices with a discrete state (the 555 latch): would the solution x change it? */
  pending?(x: Float64Array): boolean;
  commitState?(x: Float64Array): void;
}

const near = (a: number, b: number) => Math.abs(a - b) <= RELTOL * Math.max(Math.abs(a), Math.abs(b)) + ABSTOL;

class Resistor implements Device {
  /** r(T) = r·(1 + tc1·ΔT + tc2·ΔT²) with ΔT = T − 27 °C. */
  constructor(public el: Element & { kind: 'R' }, private a: number, private b: number, private dt = 0) {}
  get g() {
    const { r, tc1 = 0, tc2 = 0 } = this.el, dt = this.dt;
    return 1 / Math.max(r * (1 + tc1 * dt + tc2 * dt * dt), 1e-12);
  }
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
  /** `heldAtStart`: a power-on start (uic) holds it at 0 V. A junction capacitance is not: it
   *  belongs to its device's state and starts at the voltage of the first solution. */
  constructor(public el: Element & { kind: 'C' }, private a: number, private b: number, private heldAtStart = true) {}
  /** Companion model of one time step: the capacitor becomes a conductance g in parallel with a
   *  current source, i = g·v − ieq.
   *  Backward Euler:  i = C·(v − v₋)/h            → g = C/h,  ieq = g·v₋
   *  Trapezoidal:     i = 2C·(v − v₋)/h − i₋      → g = 2C/h, ieq = g·v₋ + i₋ */
  private comp(c: Ctx): [number, number] {
    const C = this.el.c;
    if (c.method === 'be') { const g = C / c.h; return [g, g * this.vprev]; }
    const g = (2 * C) / c.h; return [g, g * this.vprev + this.iprev];
  }
  load(c: Ctx) {
    if (c.mode === 'dc') {
      // a power-on start holds it at 0 V, or at its initial voltage (SPICE IC=)
      if (c.uic && this.heldAtStart) { stampG(c, this.a, this.b, 1e4); const ic = this.el.ic ?? 0; if (ic) { rhs(c, this.a, 1e4 * ic); rhs(c, this.b, -1e4 * ic); } }
      return;
    }
    const [g, ieq] = this.comp(c); // i = g·v − ieq
    stampG(c, this.a, this.b, g);
    rhs(c, this.a, ieq); rhs(c, this.b, -ieq);
  }
  private hist: [number, number][] = [];
  initTran(x: Float64Array) { this.vprev = V(x, this.a) - V(x, this.b); this.iprev = 0; this.inow = 0; this.hist = [[0, this.el.c * this.vprev]]; }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode === 'dc') { this.inow = 0; return; }
    const v = V(x, this.a) - V(x, this.b);
    const [g, ieq] = this.comp(c);
    this.inow = g * v - ieq;
    const flip = c.method === 'trap' && this.inow * this.iprev < 0 && Math.abs(this.inow) > 1e-6 && Math.abs(this.inow) < 2 * Math.abs(this.iprev) && Math.abs(this.iprev) < 2 * Math.abs(this.inow);
    this.ring = flip ? this.ring + 1 : 0;
    this.vprev = v; this.iprev = this.inow;
    this.hist.push([c.t, this.el.c * v]);
    if (this.hist.length > 3) this.hist.shift();
  }
  resetHistory() { this.hist = this.hist.slice(-1); }
  private ring = 0;
  rings() { if (this.ring < 3) return false; this.ring = 0; return true; }
  lte(x: Float64Array, c: Ctx) {
    const v = V(x, this.a) - V(x, this.b), q = this.el.c * v;
    const [g, ieq] = this.comp(c), i = g * v - ieq;
    const tol = Math.max(ABSTOL + RELTOL * Math.max(Math.abs(i), Math.abs(this.iprev)), (RELTOL * Math.max(Math.abs(q), Math.abs(this.el.c * this.vprev), CHGTOL)) / c.h);
    return lteStep(this.hist, c.t, q, c.h, c.method, tol);
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
  get branch() { return this.k; }
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

/** Flux of a core with inductance l at its current i, and the incremental inductance dφ/di.
 *  isat: the current at which the incremental inductance has fallen by 20 % (a datasheet's
 *  saturation current). φ = r·l·i + (1 − r)·l·Is·f(i/Is) with f(x) = x/(1 + |x|⁶)^(1/6): a
 *  sharp knee (the flux levels off at about 1.3 × l·isat) and above it the residual
 *  inductance r·l of the winding's air path (a gapped inductor's core about 1/50, an ungapped
 *  transformer core 1/200). Is = isat/0.7714 (f′ = 0.8 there). */
export function coreFlux(l: number, i: number, isat?: number, r = 1 / 50): [number, number] {
  if (!isat) return [l * i, l];
  const is = isat / 0.7714, x = i / is, a = Math.abs(x), g = Math.pow(1 + Math.pow(a, 6), 1 / 6);
  return [r * l * i + (1 - r) * l * is * (x / g), r * l + (1 - r) * l * Math.pow(g, -7)];
}

/** The current at which a saturating core is linearised in a Newton iteration: at most
 *  max(isat, |last|/2) from the last iterate. Across the knee the incremental inductance
 *  changes 50 to 200 times, and an unlimited step overshoots back and forth (the transient
 *  failed to converge, found in the unit tests). */
/** A saturating core integrates with backward Euler only near its knee (above 60 % of isat,
 *  where its inductance starts to fall): below it the inductance is within 1.2 % of its
 *  linear value and the trapezoidal rule is stable and needs far fewer steps (with backward
 *  Euler everywhere the output inductor alone forced 300 000 extra steps per 14 ms). */
export const nearKnee = (i: number, isat?: number) => !!isat && Math.abs(i) > 0.6 * isat;

function satLimit(i: number, last: number, isat: number) {
  const d = Number((globalThis as { __satLim?: number }).__satLim ?? 1) * Math.max(isat, 0.5 * Math.abs(last));
  return Math.min(Math.max(i, last - d), last + d);
}

class Inductor extends Branch {
  iprev = 0; vprev = 0; private fprev = 0; private iIt = 0;
  constructor(public el: Element & { kind: 'L' }, p: number, q: number, k: number) { super(p, q, k); }
  /** The inductor keeps its current as an unknown (branch row k): v = dφ/dt with φ(i) the
   *  core's flux (linear without isat), linearised at the iterate i₀ (incremental L = dφ/di):
   *  Backward Euler:  v − (L/h)·i = (φ(i₀) − L·i₀ − φ₋)/h
   *  Trapezoidal:     v − (2L/h)·i = (2/h)·(φ(i₀) − L·i₀ − φ₋) − v₋
   *  A saturating core near its knee with Backward Euler (see the transformer below).
   *  At DC it is a short (v = 0); at a power-on start (uic) its current is held at 0. */
  load(c: Ctx) {
    if (c.mode === 'dc' && c.uic) { add(c, this.p, this.k, 1); add(c, this.q, this.k, -1); add(c, this.k, this.k, 1); return; }
    this.stampBranch(c);
    if (c.mode === 'dc') return;
    let i0 = 0;
    if (this.el.isat) { i0 = c.init ? this.iprev : satLimit(c.x[this.k], this.iIt, this.el.isat); this.iIt = i0; }
    const [f0, L] = coreFlux(this.el.l, i0, this.el.isat), off = f0 - L * i0 - this.fprev;
    if (c.method === 'be' || nearKnee(this.iprev, this.el.isat)) { const r = L / c.h; add(c, this.k, this.k, -r); rhs(c, this.k, off / c.h); }
    else { const r = (2 * L) / c.h; add(c, this.k, this.k, -r); rhs(c, this.k, (2 * off) / c.h - this.vprev); }
  }
  flux(i: number) { return coreFlux(this.el.l, i, this.el.isat)[0]; }
  /** A saturating core has converged only where it was linearised (the step limit may still
   *  be walking its current towards the solution while every node voltage has settled). */
  converged(x: Float64Array) { return !this.el.isat || Math.abs(x[this.k] - this.iIt) <= RELTOL * Math.max(Math.abs(x[this.k]), Math.abs(this.iIt)) + ABSTOL; }
  private hist: [number, number][] = [];
  initTran(x: Float64Array) { this.iprev = x[this.k]; this.iIt = this.iprev; this.vprev = 0; this.fprev = this.flux(this.iprev); this.hist = [[0, this.fprev]]; }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode !== 'tran') return;
    this.iprev = x[this.k]; this.iIt = this.iprev; this.vprev = V(x, this.p) - V(x, this.q); this.fprev = this.flux(this.iprev);
    this.hist.push([c.t, this.fprev]);
    if (this.hist.length > 3) this.hist.shift();
  }
  resetHistory() { this.hist = this.hist.slice(-1); }
  lte(x: Float64Array, c: Ctx) {
    const i = x[this.k], v = V(x, this.p) - V(x, this.q), f = this.flux(i);
    const tol = Math.max(VNTOL + RELTOL * Math.max(Math.abs(v), Math.abs(this.vprev)), (RELTOL * Math.max(Math.abs(f), Math.abs(this.fprev), CHGTOL)) / c.h);
    return lteStep(this.hist, c.t, f, c.h, nearKnee(this.iprev, this.el.isat) ? 'be' : c.method, tol);
  }
  loadAC(c: AcCtx) {
    addc(c, this.p, this.k, 1, 0); addc(c, this.q, this.k, -1, 0); addc(c, this.k, this.p, 1, 0); addc(c, this.k, this.q, -1, 0);
    addc(c, this.k, this.k, 0, -c.w * coreFlux(this.el.l, this.iprev, this.el.isat)[1]);
  }
}

/** Transformer with a saturating core (element TX): branch rows k1 (winding a–b) and k2
 *  (winding c–d). Flux linkages λ1 = Ll1·i1 + φ(im), λ2 = Ll2·i2 + n·φ(im), im = i1 + n·i2,
 *  φ the magnetising inductance k·l1's core flux (coreFlux with isat), Ll1 = (1 − k)·l1,
 *  Ll2 = (1 − k)·n²·l1; v = dλ/dt integrated and linearised as the inductor's; the ungapped
 *  core's residual inductance 1/200. */
class SatTransformer implements Device {
  private ip = [0, 0]; private vp = [0, 0]; private lp = [0, 0]; private imIt = 0;
  private hist: [number, number][][] = [[], []];
  constructor(public el: Element & { kind: 'TX' }, private a: number, private b: number, private c2: number, private d: number, private k1: number, private k2: number) {}
  get branch() { return this.k1; }
  converged(x: Float64Array) { const im = x[this.k1] + this.el.n * x[this.k2]; return !this.el.isat || Math.abs(im - this.imIt) <= RELTOL * Math.max(Math.abs(im), Math.abs(this.imIt)) + ABSTOL; }
  private parts() { const { l1, n, k } = this.el; return { lm: k * l1, ll1: (1 - k) * l1, ll2: (1 - k) * n * n * l1, n }; }
  private lambda(i1: number, i2: number): [number, number] {
    const { lm, ll1, ll2, n } = this.parts(), f = coreFlux(lm, i1 + n * i2, this.el.isat, 1 / 200)[0];
    return [ll1 * i1 + f, ll2 * i2 + n * f];
  }
  load(c: Ctx) {
    const { k1, k2 } = this;
    const pins: [number, number, number][] = [[this.a, this.b, k1], [this.c2, this.d, k2]];
    if (c.mode === 'dc' && c.uic) { for (const [p, q, k] of pins) { add(c, p, k, 1); add(c, q, k, -1); add(c, k, k, 1); } return; }
    for (const [p, q, k] of pins) { add(c, p, k, 1); add(c, q, k, -1); add(c, k, p, 1); add(c, k, q, -1); }
    if (c.mode === 'dc') return;
    const { lm, ll1, ll2, n } = this.parts();
    let im = 0;
    if (this.el.isat) { im = c.init ? this.ip[0] + n * this.ip[1] : satLimit(c.x[k1] + n * c.x[k2], this.imIt, this.el.isat); this.imIt = im; }
    const [f0, ld] = coreFlux(lm, im, this.el.isat, 1 / 200), off = f0 - ld * im;
    // λ1 ≈ (ll1 + ld)·i1 + n·ld·i2 + off; λ2 ≈ n·ld·i1 + (ll2 + n²·ld)·i2 + n·off
    const m = [[ll1 + ld, n * ld], [n * ld, ll2 + n * n * ld]], o = [off, n * off];
    // a saturating core near its knee with backward Euler: the trapezoidal rule only holds a
    // stiff mode (a winding into a high impedance) at −1 per step, and with the inductance
    // changing from step to step that mode grew without bound (found in the unit tests)
    const s = c.method === 'be' || nearKnee(this.ip[0] + this.el.n * this.ip[1], this.el.isat) ? 1 : 2;
    for (let w = 0; w < 2; w++) {
      const k = w ? k2 : k1;
      add(c, k, k1, -(s * m[w][0]) / c.h); add(c, k, k2, -(s * m[w][1]) / c.h);
      rhs(c, k, (s * (o[w] - this.lp[w])) / c.h - (s === 2 ? this.vp[w] : 0));
    }
  }
  initTran(x: Float64Array) {
    this.ip = [x[this.k1], x[this.k2]]; this.imIt = this.ip[0] + this.el.n * this.ip[1]; this.vp = [0, 0]; this.lp = this.lambda(this.ip[0], this.ip[1]);
    this.hist = [[[0, this.lp[0]]], [[0, this.lp[1]]]];
  }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode !== 'tran') return;
    this.ip = [x[this.k1], x[this.k2]]; this.imIt = this.ip[0] + this.el.n * this.ip[1]; this.vp = [V(x, this.a) - V(x, this.b), V(x, this.c2) - V(x, this.d)];
    this.lp = this.lambda(this.ip[0], this.ip[1]);
    for (let w = 0; w < 2; w++) { this.hist[w].push([c.t, this.lp[w]]); if (this.hist[w].length > 3) this.hist[w].shift(); }
  }
  resetHistory() { this.hist = this.hist.map((h) => h.slice(-1)); }
  lte(x: Float64Array, c: Ctx) {
    const lam = this.lambda(x[this.k1], x[this.k2]), v = [V(x, this.a) - V(x, this.b), V(x, this.c2) - V(x, this.d)];
    let h = Infinity;
    for (let w = 0; w < 2; w++) {
      const tol = Math.max(VNTOL + RELTOL * Math.max(Math.abs(v[w]), Math.abs(this.vp[w])), (RELTOL * Math.max(Math.abs(lam[w]), Math.abs(this.lp[w]), CHGTOL)) / c.h);
      h = Math.min(h, lteStep(this.hist[w], c.t, lam[w], c.h, nearKnee(this.ip[0] + this.el.n * this.ip[1], this.el.isat) ? 'be' : c.method, tol));
      if (h < 1e-12 && (globalThis as { __simDebug?: (s: string) => void }).__simDebug) (globalThis as { __simDebug?: (s: string) => void }).__simDebug!(`TXLTE w=${w} h=${h.toExponential(2)} lam=${lam[w]} hist=${JSON.stringify(this.hist[w])} i=${x[this.k1]},${x[this.k2]} v=${v[w]} tol=${tol}`);
    }
    return h;
  }
  loadAC(c: AcCtx) {
    const { lm, ll1, ll2, n } = this.parts(), ld = coreFlux(lm, this.ip[0] + n * this.ip[1], this.el.isat, 1 / 200)[1];
    const m = [[ll1 + ld, n * ld], [n * ld, ll2 + n * n * ld]];
    const pins: [number, number, number][] = [[this.a, this.b, this.k1], [this.c2, this.d, this.k2]];
    for (const [p, q, k] of pins) { addc(c, p, k, 1, 0); addc(c, q, k, -1, 0); addc(c, k, p, 1, 0); addc(c, k, q, -1, 0); }
    for (let w = 0; w < 2; w++) { const k = w ? this.k2 : this.k1; addc(c, k, this.k1, 0, -c.w * m[w][0]); addc(c, k, this.k2, 0, -c.w * m[w][1]); }
  }
  currents(x: Float64Array) { return [x[this.k1], -x[this.k1], x[this.k2], -x[this.k2]]; }
  acCurrents(re: Float64Array, im: Float64Array) { return [[re[this.k1], im[this.k1]], [-re[this.k1], -im[this.k1]], [re[this.k2], im[this.k2]], [-re[this.k2], -im[this.k2]]] as [number, number][]; }
}

/** Mutual inductance between two inductors. Their branch rows get the coupled flux term
 *  M·di/dt with the same integration method as the inductors themselves (BE or trapezoidal). */
class Mutual implements Device {
  constructor(public el: Element & { kind: 'K' }, private a: Inductor, private b: Inductor) {}
  get m() { return this.el.k * Math.sqrt(this.a.el.l * this.b.el.l); }
  load(c: Ctx) {
    if (c.mode === 'dc') return;
    const r = (c.method === 'be' ? 1 : 2) * this.m / c.h;
    add(c, this.a.branch, this.b.branch, -r); rhs(c, this.a.branch, -r * this.b.iprev);
    add(c, this.b.branch, this.a.branch, -r); rhs(c, this.b.branch, -r * this.a.iprev);
  }
  loadAC(c: AcCtx) {
    addc(c, this.a.branch, this.b.branch, 0, -c.w * this.m);
    addc(c, this.b.branch, this.a.branch, 0, -c.w * this.m);
  }
  currents() { return []; }
  acCurrents() { return []; }
}

/** Current-controlled switch with hysteresis (relay contact): a discrete state, settled at the
 *  operating point and located in time like the 555 latch. */
class CSwitch implements Device {
  on = false;
  constructor(public el: Element & { kind: 'W' }, private a: number, private b: number, private sense: VSource) {}
  private iLast = 0;
  private next(x: Float64Array) {
    const i = Math.abs(x[this.sense.branch]);
    const want = i > this.el.it + this.el.ih ? true : i < this.el.it - this.el.ih ? false : this.on;
    // zc: an opening contact keeps its arc until the current through it passes zero
    if (this.el.zc && want !== this.on && this.gOf(want) < this.g) {
      const ic = (V(x, this.a) - V(x, this.b)) * this.g;
      if (ic * this.iLast > 0) return this.on;
    }
    return want;
  }
  private gOf(on: boolean) { return 1 / (on ? this.el.ron : this.el.roff); }
  // the decision is taken where the change is found: the point is accepted (and iLast moves
  // past the zero) before the state is committed
  private decided: boolean | undefined;
  pending(x: Float64Array) { this.decided = this.next(x); return this.decided !== this.on; }
  commitState(x: Float64Array) { this.on = this.decided ?? this.next(x); this.decided = undefined; }
  accept(_c: Ctx, x: Float64Array) { this.iLast = (V(x, this.a) - V(x, this.b)) * this.g; }
  get g() { return this.gOf(this.on); }
  load(c: Ctx) { stampG(c, this.a, this.b, this.g); }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, this.g, 0); }
  currents(x: Float64Array) { const i = (V(x, this.a) - V(x, this.b)) * this.g; return [i, -i]; }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [ar, ai] = Vc(re, im, this.a), [br, bi] = Vc(re, im, this.b);
    return [[(ar - br) * this.g, (ai - bi) * this.g], [-(ar - br) * this.g, -(ai - bi) * this.g]] as [number, number][];
  }
}

/** Metal-oxide varistor: i = 1 mA·sign(v)·(|v|/vn)^α. Its current rises by e for every 1/α
 *  of relative voltage, so the Newton step is limited like a junction's (pnjlim with
 *  V_T = vn/α, around vn). */
class Varistor implements Device {
  v = 0; g = GMIN; i0 = 0;
  constructor(public el: Element & { kind: 'Z' }, private a: number, private b: number) {}
  private eval(v: number): [number, number] {
    const { vn, alpha } = this.el, u = Math.abs(v) / vn;
    if (u === 0) return [0, GMIN];
    const i = 1e-3 * Math.pow(u, alpha);
    return [Math.sign(v) * i + GMIN * v, (alpha * i) / Math.abs(v) + GMIN];
  }
  load(c: Ctx) {
    let v = V(c.x, this.a) - V(c.x, this.b);
    if (!c.init) {
      const { vn, alpha } = this.el, vt = vn / alpha;
      const lim = (x: number, old: number) => pnjlim(x, old, vt, vn, c);
      v = v >= 0 ? lim(v, Math.max(this.v, 0)) : -lim(-v, Math.max(-this.v, 0));
    } else v = 0;
    const [i, g] = this.eval(v);
    this.v = v; this.i0 = i; this.g = g;
    stampJ(c, this.a, this.b, i, g, v);
  }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, this.g, 0); }
  currents(x: Float64Array) { const [i] = this.eval(V(x, this.a) - V(x, this.b)); return [i, -i]; }
  converged(x: Float64Array) { const v = V(x, this.a) - V(x, this.b); return near(this.eval(v)[0], this.i0 + this.g * (v - this.v)); }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [ar, ai] = Vc(re, im, this.a), [br, bi] = Vc(re, im, this.b);
    return [[(ar - br) * this.g, (ai - bi) * this.g], [-(ar - br) * this.g, -(ai - bi) * this.g]] as [number, number][];
  }
}

/** Voltage-controlled switch with hysteresis (SPICE S): a discrete state like the relay contact. */
class VSwitch implements Device {
  on = false;
  constructor(public el: Element & { kind: 'S' }, private a: number, private b: number, private cp: number, private cn: number) {}
  private next(x: Float64Array) {
    const v = V(x, this.cp) - V(x, this.cn);
    if (v > this.el.vt + this.el.vh) return true;
    if (v < this.el.vt - this.el.vh) return false;
    return this.on;
  }
  pending(x: Float64Array) { return this.next(x) !== this.on; }
  commitState(x: Float64Array) { this.on = this.next(x); }
  get g() { return 1 / (this.on ? this.el.ron : this.el.roff); }
  load(c: Ctx) { stampG(c, this.a, this.b, this.g); }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, this.g, 0); }
  currents(x: Float64Array) { const i = (V(x, this.a) - V(x, this.b)) * this.g; return [i, -i, 0, 0]; }
  acCurrents(re: Float64Array, im: Float64Array) {
    const [ar, ai] = Vc(re, im, this.a), [br, bi] = Vc(re, im, this.b);
    return [[(ar - br) * this.g, (ai - bi) * this.g], [-(ar - br) * this.g, -(ai - bi) * this.g], [0, 0], [0, 0]] as [number, number][];
  }
}

/** Gas discharge tube: open until |v| > vspark; then an arc (varc in series with ron, in the
 *  direction of the spark) until the current falls below ihold. */
class Gdt implements Device {
  dir = 0; // 0 off, ±1 conducting
  constructor(public el: Element & { kind: 'N' }, private a: number, private b: number) {}
  private static readonly GOFF = 1e-10;
  private next(x: Float64Array): number {
    const v = V(x, this.a) - V(x, this.b);
    if (this.dir === 0) return Math.abs(v) > this.el.vspark ? Math.sign(v) : 0;
    const i = (v - this.dir * this.el.varc) / this.el.ron;
    return i * this.dir < this.el.ihold ? 0 : this.dir;
  }
  pending(x: Float64Array) { return this.next(x) !== this.dir; }
  commitState(x: Float64Array) { this.dir = this.next(x); }
  load(c: Ctx) {
    if (this.dir === 0) { stampG(c, this.a, this.b, Gdt.GOFF); return; }
    // i = (v − dir·varc)/ron: a conductance and a source
    const g = 1 / this.el.ron;
    stampG(c, this.a, this.b, g);
    rhs(c, this.a, (this.dir * this.el.varc) * g); rhs(c, this.b, -(this.dir * this.el.varc) * g);
  }
  loadAC(c: AcCtx) { stampGc(c, this.a, this.b, this.dir ? 1 / this.el.ron : Gdt.GOFF, 0); }
  currents(x: Float64Array) {
    const v = V(x, this.a) - V(x, this.b);
    const i = this.dir === 0 ? v * Gdt.GOFF : (v - this.dir * this.el.varc) / this.el.ron;
    return [i, -i];
  }
}

/** Circuit breaker (thermal-magnetic, optionally with a residual-current trip). */
class Breaker implements Device {
  closed: boolean;
  /** Thermal state: i²/inom², low-pass filtered with tau. */
  theta = 0;
  private tLast = 0;
  static readonly THERMAL_TRIP = 1.66;
  constructor(public el: Element & { kind: 'Y' }, private poles: [number, number][]) { this.closed = el.closed; }
  private g() { return this.closed ? 1 / this.el.ron : 1e-12; }
  private poleI(x: Float64Array) { return this.poles.map(([a, b]) => (V(x, a) - V(x, b)) * this.g()); }
  private trips(x: Float64Array): boolean {
    if (!this.closed) return false;
    const i = this.poleI(x), e = this.el;
    if (i.some((v) => Math.abs(v) > e.mag * e.inom * Math.SQRT2)) return true;
    if (e.idn > 0 && Math.abs(i.reduce((s, v) => s + v, 0)) > 0.8 * e.idn) return true;
    return this.theta >= Breaker.THERMAL_TRIP;
  }
  pending(x: Float64Array) { return this.trips(x); }
  commitState(x: Float64Array) { if (this.trips(x)) this.closed = false; }
  initTran() { this.tLast = 0; }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode !== 'tran' || !this.closed) return;
    const h = Math.max(0, c.t - this.tLast);
    this.tLast = c.t;
    const q = Math.max(...this.poleI(x).map((v) => (v / this.el.inom) ** 2));
    // exact for a constant input over the step
    this.theta = q + (this.theta - q) * Math.exp(-h / this.el.tau);
  }
  load(c: Ctx) { for (const [a, b] of this.poles) stampG(c, a, b, this.g()); }
  loadAC(c: AcCtx) { for (const [a, b] of this.poles) stampGc(c, a, b, this.g(), 0); }
  currents(x: Float64Array) { return this.poleI(x).flatMap((i) => [i, -i]); }
  acCurrents(re: Float64Array, im: Float64Array) {
    return this.poles.flatMap(([a, b]) => {
      const [ar, ai] = Vc(re, im, a), [br, bi] = Vc(re, im, b), g = this.g();
      return [[(ar - br) * g, (ai - bi) * g], [-(ar - br) * g, -(ai - bi) * g]] as [number, number][];
    });
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
  private vte: number; private vcrit: number; private tbv?: number; private is: number;
  /** The junction capacitance, across the junction (inside the series resistance). */
  private cj?: Capacitor;
  constructor(public el: Element & { kind: 'D' }, private a: number, private ai: number, private k: number, tk = TNOM) {
    const m = el.model;
    if (m.cj && m.cj > 0) this.cj = new Capacitor({ kind: 'C', name: `${el.name}#cj`, a: '', b: '', c: m.cj }, ai, k, false);
    this.vte = m.n * thermalVoltage(tk);
    this.is = satCurrent(m.is, m.n, tk, m.xti, m.eg);
    this.vcrit = this.vte * Math.log(this.vte / (Math.SQRT2 * this.is));
    this.tbv = breakdownVoltage({ ...m, is: this.is }, this.vte);
  }
  private eval(vd: number): [number, number] {
    const is = this.is, vte = this.vte;
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
    this.cj?.load(c);
  }
  initTran(x: Float64Array) { this.cj?.initTran(x); }
  accept(c: Ctx, x: Float64Array) { this.cj?.accept(c, x); }
  resetHistory() { this.cj?.resetHistory(); }
  lte(x: Float64Array, c: Ctx) { return this.cj ? this.cj.lte(x, c) : Infinity; }
  loadAC(c: AcCtx) {
    if (this.ai !== this.a) stampGc(c, this.a, this.ai, 1 / this.el.model.rs, 0);
    stampGc(c, this.ai, this.k, this.gd, 0);
    this.cj?.loadAC(c);
  }
  currents(x: Float64Array) {
    const [i] = this.eval(V(x, this.ai) - V(x, this.k));
    const ic = this.cj ? this.cj.currents()[0] : 0;
    return [i + ic, -i - ic];
  }
  converged(x: Float64Array) {
    const vd = V(x, this.ai) - V(x, this.k);
    return near(this.eval(vd)[0], this.cd + this.gd * (vd - this.vd));
  }
  acCurrents(re: Float64Array, im: Float64Array, w: number) {
    const [ar, ai] = Vc(re, im, this.ai), [kr, ki] = Vc(re, im, this.k);
    const y = this.cj ? w * this.cj.el.c : 0;
    const r = this.gd * (ar - kr) - y * (ai - ki), i = this.gd * (ai - ki) + y * (ar - kr);
    return [[r, i], [-r, -i]] as [number, number][];
  }
}

class Bjt implements Device {
  vbe = 0; vbc = 0;
  // small-signal partial derivatives at the last evaluation
  private d = { cc: 0, cb: 0, ccBe: 0, ccBc: 0, cbBe: 0, cbBc: 0 };
  private sgn: number; private vcritF: number; private vcritR: number;
  private vtf: number; private vtr: number; private is: number;
  constructor(public el: Element & { kind: 'Q' }, private c: number, private b: number, private e: number, tk = TNOM) {
    const m = el.model;
    this.sgn = m.type === 'npn' ? 1 : -1;
    this.is = satCurrent(m.is, 1, tk, m.xti, m.eg);
    this.vtf = m.nf * thermalVoltage(tk); this.vtr = m.nr * thermalVoltage(tk);
    this.vcritF = this.vtf * Math.log(this.vtf / (Math.SQRT2 * this.is));
    this.vcritR = this.vtr * Math.log(this.vtr / (Math.SQRT2 * this.is));
  }
  private eval(vbe: number, vbc: number) {
    const m: BjtModel = this.el.model;
    const vtf = this.vtf, vtr = this.vtr, is = this.is;
    const ebe = exp(vbe / vtf), ebc = exp(vbc / vtr);
    const cbe = is * (ebe - 1) + GMIN * vbe, gbe = (is * ebe) / vtf + GMIN;
    const cbc = is * (ebc - 1) + GMIN * vbc, gbc = (is * ebc) / vtr + GMIN;
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
      vbe = pnjlim(vbe, this.vbe, this.vtf, this.vcritF, c);
      vbc = pnjlim(vbc, this.vbc, this.vtr, this.vcritR, c);
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
  private vt: number; private is: number;
  private ss = { gm: 0, gds: 0, rev: false, gbd: 0, cd: 0 };
  constructor(public el: Element & { kind: 'M' }, private d: number, private g: number, private s: number, tk = TNOM) {
    const m: MosModel = el.model;
    const t = tk === TNOM ? m : mosAtTemp(m, tk);
    this.sgn = m.type === 'nmos' ? 1 : -1;
    this.von = this.sgn * t.vto;
    this.beta = (t.kp * m.w) / m.l;
    this.vt = thermalVoltage(tk); this.is = t.is;
    this.vcrit = this.vt * Math.log(this.vt / (Math.SQRT2 * this.is));
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
    const is = this.is, vt = this.vt;
    if (vbd <= -3 * vt) return [GMIN * vbd - is, GMIN];
    const e = exp(vbd / vt);
    return [is * (e - 1) + GMIN * vbd, (is * e) / vt + GMIN];
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
      vbd = pnjlim(vbd, this.vbd, this.vt, this.vcrit, c);
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

/** 555 timer: internal 5 kΩ divider, comparators at V(CTRL) and V(CTRL)/2, RS latch (trigger
 *  wins, reset below 0.7 V), output 1.7 V below VCC or 0.1 V above GND through 10 Ω,
 *  discharge 10 Ω to GND when the output is low. NE555 levels; the latch changes only at
 *  accepted time points, located to within a small fraction of the time step. */
class Timer555 implements Device {
  q = 0;
  private static readonly R = 5e3;
  private static readonly GOUT = 1 / 10;
  constructor(public el: Element & { kind: 'T' }, private n: { gnd: number; trig: number; out: number; rst: number; ctrl: number; thr: number; dis: number; vcc: number; n13: number }) {}
  private next(x: Float64Array): number {
    const n = this.n, g = V(x, n.gnd);
    const ctrl = V(x, n.ctrl) - g;
    if (V(x, n.rst) - g < 0.7) return 0;
    if (V(x, n.trig) - g < ctrl / 2) return 1;
    if (V(x, n.thr) - g > ctrl) return 0;
    return this.q;
  }
  pending(x: Float64Array) { return this.next(x) !== this.q; }
  commitState(x: Float64Array) { this.q = this.next(x); }
  private stamp(c: { A: Float64Array; n: number }, z: ((i: number, v: number) => void) | null) {
    const n = this.n, g = 1 / Timer555.R;
    stampG(c, n.vcc, n.ctrl, g); stampG(c, n.ctrl, n.n13, g); stampG(c, n.n13, n.gnd, g);
    const ref = this.q ? n.vcc : n.gnd, off = this.q ? -1.7 : 0.1;
    stampG(c, n.out, ref, Timer555.GOUT);
    if (z) { z(n.out, Timer555.GOUT * off); z(ref, -Timer555.GOUT * off); }
    stampG(c, n.dis, n.gnd, this.q ? 1e-9 : Timer555.GOUT);
  }
  load(c: Ctx) { this.stamp(c, (i, v) => rhs(c, i, v)); }
  loadAC(c: AcCtx) {
    const shim = { A: c.Ar, n: c.n };
    this.stamp(shim, null);
  }
  currents(x: Float64Array) {
    const n = this.n, v = (i: number) => V(x, i), g = 1 / Timer555.R;
    const ref = this.q ? n.vcc : n.gnd, off = this.q ? -1.7 : 0.1;
    const iOut = Timer555.GOUT * (v(n.out) - v(ref) - off); // into the output pin
    const iDis = (v(n.dis) - v(n.gnd)) * (this.q ? 1e-9 : Timer555.GOUT);
    const iVcc = (v(n.vcc) - v(n.ctrl)) * g + (this.q ? -iOut : 0);
    const iCtrl = (v(n.ctrl) - v(n.n13)) * g - (v(n.vcc) - v(n.ctrl)) * g;
    const iGnd = -(iOut + iDis + iVcc + iCtrl);
    // order: gnd, trig, out, rst, ctrl, thr, dis, vcc
    return [iGnd, 0, iOut, 0, iCtrl, 0, iDis, iVcc];
  }
}

class Logic implements Device {
  /** Output levels (1 = high); the Schmitt input state; the flip-flop's last clock level. */
  out: number[];
  private inHigh = false;
  private lastClk = false;
  private static readonly GOUT = 1 / 50;
  private static readonly GIN = 1e-7;
  constructor(public el: Element & { kind: 'X' }, private ins: number[], private outs: number[], private vcc: number) {
    this.out = outs.map(() => 0);
  }
  private next(x: Float64Array): { out: number[]; inHigh: boolean; clk: boolean } {
    const vcc = V(x, this.vcc), hi = (n: number) => V(x, n) > 0.5 * vcc;
    const a = this.ins.map(hi);
    const f = this.el.fn;
    let inHigh = this.inHigh, clk = this.lastClk, out = [...this.out];
    switch (f) {
      case 'and': out = [a.every(Boolean) ? 1 : 0]; break;
      case 'or': out = [a.some(Boolean) ? 1 : 0]; break;
      case 'nand': out = [a.every(Boolean) ? 0 : 1]; break;
      case 'nor': out = [a.some(Boolean) ? 0 : 1]; break;
      case 'xor': out = [a.filter(Boolean).length % 2]; break;
      case 'not': out = [a[0] ? 0 : 1]; break;
      case 'schmitt': {
        const v = V(x, this.ins[0]);
        if (v > 0.6 * vcc) inHigh = true; else if (v < 0.4 * vcc) inHigh = false;
        out = [inHigh ? 0 : 1];
        break;
      }
      case 'dff': {
        clk = a[1];
        if (clk && !this.lastClk) out = a[0] ? [1, 0] : [0, 1];
        else if (this.out[0] === this.out[1]) out = [0, 1]; // power-up state: Q low
        break;
      }
    }
    return { out, inHigh, clk };
  }
  pending(x: Float64Array) {
    const n = this.next(x);
    return n.inHigh !== this.inHigh || n.clk !== this.lastClk || n.out.some((v, k) => v !== this.out[k]);
  }
  commitState(x: Float64Array) { const n = this.next(x); this.out = n.out; this.inHigh = n.inHigh; this.lastClk = n.clk; }
  private stamp(c: { A: Float64Array; n: number }) {
    for (const i of this.ins) stampG(c, i, -1, Logic.GIN);
    this.outs.forEach((o, k) => stampG(c, o, this.out[k] ? this.vcc : -1, Logic.GOUT));
  }
  load(c: Ctx) { this.stamp(c); }
  loadAC(c: AcCtx) { this.stamp({ A: c.Ar, n: c.n }); }
  currents(x: Float64Array) {
    const iin = this.ins.map((i) => V(x, i) * Logic.GIN);
    let ivcc = 0;
    const iout = this.outs.map((o, k) => {
      const i = Logic.GOUT * (V(x, o) - (this.out[k] ? V(x, this.vcc) : 0));
      if (this.out[k]) ivcc -= i;
      return i;
    });
    return [...iin, ...iout, ivcc];
  }
}

class Servo implements Device {
  angle = 0; target = 0; private high = false; private tRise = 0; private tLast = 0;
  private static readonly G = 1 / 100;
  constructor(public el: Element & { kind: 'P' }, private sig: number, private gnd: number, private out: number) {}
  private stamp(c: { A: Float64Array; n: number }, z: ((i: number, v: number) => void) | null) {
    stampG(c, this.out, this.gnd, Servo.G);
    if (z) { z(this.out, Servo.G * this.angle / 100); z(this.gnd, -Servo.G * this.angle / 100); }
  }
  load(c: Ctx) { this.stamp(c, (i, v) => rhs(c, i, v)); }
  loadAC(c: AcCtx) { this.stamp({ A: c.Ar, n: c.n }, null); }
  initTran() { this.high = false; this.tLast = 0; }
  accept(c: Ctx, x: Float64Array) {
    if (c.mode !== 'tran') return;
    const t = c.t, v = V(x, this.sig) - V(x, this.gnd);
    if (!this.high && v > 1.5) { this.high = true; this.tRise = t; }
    else if (this.high && v < 1.5) {
      this.high = false;
      const w = t - this.tRise;
      // pulses outside 0.5 – 2.5 ms are not servo commands
      if (w > 0.5e-3 && w < 2.5e-3) this.target = Math.min(90, Math.max(-90, (w - 1.5e-3) / 0.5e-3 * 90));
    }
    const step = this.el.slew * Math.max(0, t - this.tLast);
    this.angle += Math.max(-step, Math.min(step, this.target - this.angle));
    this.tLast = t;
  }
  currents(x: Float64Array) {
    const i = Servo.G * (V(x, this.out) - V(x, this.gnd) - this.angle / 100);
    return [0, -i, i];
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
    const timerNode = new Map<string, number>();
    for (const e of circuit.elements) if (e.kind === 'T') timerNode.set(e.name, node(`${e.name}#n13`, false));
    let k = this.nNodes;
    const br = () => k++;
    const tk = (circuit.temp ?? 27) + 273.15, at = (e: { fixedTemp?: boolean; tempC?: number }) => (e.fixedTemp ? TNOM : e.tempC !== undefined ? e.tempC + 273.15 : tk);
    if (!(tk > 0)) throw new SimError(`temperature ${circuit.temp} °C is below absolute zero`);
    for (const e of circuit.elements) {
      const ix = (s: string) => node(s);
      switch (e.kind) {
        case 'R': this.devices.push(new Resistor(e, ix(e.a), ix(e.b), tk - TNOM)); break;
        case 'C': this.devices.push(new Capacitor(e, ix(e.a), ix(e.b), !e.free)); break;
        case 'L': this.devices.push(new Inductor(e, ix(e.a), ix(e.b), br())); break;
        case 'TX': { const k1 = br(), k2 = br(); this.devices.push(new SatTransformer(e, ix(e.a), ix(e.b), ix(e.c), ix(e.d), k1, k2)); break; }
        case 'V': this.devices.push(new VSource(e, ix(e.p), ix(e.n), br())); this.breaks.push({ wave: e }); break;
        case 'I': this.devices.push(new ISource(e, ix(e.p), ix(e.n))); this.breaks.push({ wave: e }); break;
        case 'E': this.devices.push(new Vcvs(e, ix(e.p), ix(e.n), ix(e.cp), ix(e.cn), br())); break;
        case 'G': this.devices.push(new Vccs(e, ix(e.p), ix(e.n), ix(e.cp), ix(e.cn))); break;
        case 'D': {
          const ai = internal.find(([d]) => d === e)?.[1] ?? ix(e.a);
          this.devices.push(new Diode(e, ix(e.a), ai, ix(e.k), at(e)));
          break;
        }
        case 'Q': this.devices.push(new Bjt(e, ix(e.c), ix(e.b), ix(e.e), at(e))); break;
        case 'M': this.devices.push(new Mosfet(e, ix(e.d), ix(e.g), ix(e.s), at(e))); break;
        case 'K': case 'W': break; // after the elements they refer to
        case 'Z': this.devices.push(new Varistor(e, ix(e.a), ix(e.b))); break;
        case 'S': this.devices.push(new VSwitch(e, ix(e.p), ix(e.n), ix(e.cp), ix(e.cn))); break;
        case 'N': this.devices.push(new Gdt(e, ix(e.a), ix(e.b))); break;
        case 'Y': this.devices.push(new Breaker(e, e.poles.map((q) => [ix(q.a), ix(q.b)] as [number, number]))); break;
        case 'P': this.devices.push(new Servo(e, ix(e.sig), ix(e.gnd), ix(e.out))); break;
        case 'X': this.devices.push(new Logic(e, e.ins.map(ix), e.outs.map(ix), ix(e.vcc))); break;
        case 'T': this.devices.push(new Timer555(e, { gnd: ix(e.gnd), trig: ix(e.trig), out: ix(e.out), rst: ix(e.rst), ctrl: ix(e.ctrl), thr: ix(e.thr), dis: ix(e.dis), vcc: ix(e.vcc), n13: timerNode.get(e.name)! })); break;
      }
    }
    const byName = (name: string) => this.devices.find((d) => d.el.name === name);
    for (const e of circuit.elements) {
      if (e.kind === 'K') {
        const a = byName(e.l1), b = byName(e.l2);
        if (!(a instanceof Inductor) || !(b instanceof Inductor)) throw new SimError(`${e.name}: ${e.l1} and ${e.l2} must be inductors`);
        if (!(e.k > 0 && e.k <= 1)) throw new SimError(`${e.name}: coupling must be above 0 and at most 1`);
        this.devices.push(new Mutual(e, a, b));
      } else if (e.kind === 'W') {
        const v = byName(e.ctrl);
        if (!(v instanceof VSource)) throw new SimError(`${e.name}: controlling source ${e.ctrl} is not a voltage source`);
        this.devices.push(new CSwitch(e, node(e.p), node(e.n), v));
      }
    }
    this.n = k;
    this.x = new Float64Array(this.n);
  }

  get size() { return this.n; }

  private ctx(over: Partial<Ctx>): Ctx {
    return {
      // one matrix buffer for every context: it is filled by assemble() before each use
      A: this.matrix(), pat: this.pat, z: new Float64Array(this.n), x: this.x, n: this.n,
      mode: 'dc', t: 0, h: 0, method: 'be', srcScale: 1, gshunt: 0, init: false, noncon: false, uic: false, ...over,
    };
  }

  /** The shared matrix buffer and its pattern (every context fills it in assemble()). */
  private matrix(): Float64Array {
    if (!this.Abuf || this.Abuf.length !== this.n * this.n) {
      this.Abuf = new Float64Array(this.n * this.n);
      this.pat = { mark: new Uint8Array(this.n * this.n), list: new Int32Array(this.n * this.n), len: 0 };
    }
    return this.Abuf;
  }
  private pat?: Pattern;

  private assemble(c: Ctx) {
    const p = c.pat;
    // every non-zero was written through add(): clearing the pattern clears the matrix
    if (p) { const A = c.A, l = p.list; for (let q = 0; q < p.len; q++) A[l[q]] = 0; } else c.A.fill(0);
    c.z.fill(0); c.noncon = false;
    for (let i = 0; i < this.nNodes; i++) add(c, i, i, GSHUNT + c.gshunt);
    for (const d of this.devices) d.load(c);
  }

  /** Newton–Raphson from c.x; returns the iteration count or −1 when it did not converge. */
  private order?: Int32Array;
  private orderMode?: Ctx['mode'];
  private solver?: SparseSolver;
  private Abuf?: Float64Array;
  /** The unknown farthest from convergence after the last failed Newton solution. */
  private noConv = '';
  /** Diagnosis of a failed Newton solve (tests set globalThis.__simDebug): the unknowns that
   *  moved most in the last iteration. */
  private debugNewton(x: Float64Array, b: Float64Array, c: Ctx) {
    const names = new Map<number, string>();
    for (const [name, k] of this.nodeIndex) names.set(k, name);
    for (const d of this.devices) { const br = (d as { branch?: number }).branch; if (br !== undefined) names.set(br, `I(${d.el.name})`); }
    const rows = [...b.keys()].map((i) => ({ i, d: Math.abs(b[i] - x[i]) / (RELTOL * Math.max(Math.abs(b[i]), Math.abs(x[i])) + (i < this.nNodes ? VNTOL : ABSTOL)) })).sort((p, q) => q.d - p.d).slice(0, 12);
    (globalThis as { __simDebug?: (s: string) => void }).__simDebug!(`t=${c.t.toExponential(4)} h=${c.h.toExponential(2)} ` + rows.map(({ i }) => `${names.get(i) ?? i}: ${x[i].toPrecision(5)}→${b[i].toPrecision(5)}`).join(' | '));
  }

  /** Iterative refinement of each linear solve (switched on when a transient would fail). */
  private refine = false;

  private worstUnknown(x: Float64Array, b: Float64Array): string {
    let worst = -1, ratio = 0;
    for (let i = 0; i < b.length; i++) {
      const r = Math.abs(b[i] - x[i]) / (RELTOL * Math.max(Math.abs(b[i]), Math.abs(x[i])) + (i < this.nNodes ? VNTOL : ABSTOL));
      if (r > ratio) { ratio = r; worst = i; }
    }
    if (worst < 0) return '';
    if (worst < this.nNodes) for (const [name, k] of this.nodeIndex) if (k === worst) return `node ${name.replace(/#.*/, '')}`;
    for (const d of this.devices) if ((d as { branch?: number }).branch === worst) return `current of ${d.el.name.replace(/_.*/, '')}`;
    return '';
  }

  private newton(c: Ctx, maxIter: number, initJct: boolean): number {
    let x = c.x;
    for (let it = 1; it <= maxIter; it++) {
      c.x = x;
      c.init = initJct && it === 1;
      this.assemble(c);
      const b = c.z.slice();
      // the fill-reducing order is found once per analysis mode, from the first matrix
      if (!this.order || this.orderMode !== c.mode || this.order.length !== c.n) { this.order = minDegreeOrder(c.A, c.n); this.orderMode = c.mode; this.solver = new SparseSolver(this.order); }
      const dbg = (globalThis as { __simDebug?: (s: string) => void }).__simDebug;
      if (!this.solver!.solve(c.A, b, c.pat)) { dbg?.(`t=${c.t.toExponential(4)} h=${c.h.toExponential(2)} singular matrix`); return -1; }
      if (this.refine) this.solver!.refine(c.A, c.z, b, c.pat);
      for (let i = 0; i < b.length; i++) if (!Number.isFinite(b[i])) { dbg?.(`t=${c.t.toExponential(4)} h=${c.h.toExponential(2)} not finite at ${i}`); return -1; }
      let conv = !c.noncon && !c.init, vconv = conv;
      if (conv) {
        for (let i = 0; i < c.n; i++) {
          const tol = RELTOL * Math.max(Math.abs(b[i]), Math.abs(x[i])) + (i < this.nNodes ? VNTOL : ABSTOL);
          if (Math.abs(b[i] - x[i]) > tol) { conv = false; if (i < this.nNodes) { vconv = false; break; } }
        }
      }
      // the last iteration: every node voltage has settled and only a branch current still moves
      // (a sub-µA base current at a comparator's switching edge cycling against the 1 pA
      // tolerance: the step size shrank to nothing, found in the inverter): accept the point
      if (!conv && vconv && c.mode === 'tran' && it === maxIter) for (const d of this.devices) if (d.converged && !d.converged(b)) { vconv = false; break; }
      if (!conv && vconv && c.mode === 'tran' && it === maxIter) { x = b; c.x = x; this.assemble(c); return it; }
      if (!conv && it === maxIter) this.noConv = this.worstUnknown(x, b);
      if (!conv && it === maxIter && (globalThis as { __simDebug?: (s: string) => void }).__simDebug) this.debugNewton(x, b, c);
      if (conv) for (const d of this.devices) if (d.converged && !d.converged(b)) { conv = false; break; }
      // Newton cycling between two states (an op amp's output stage between its limits while
      // several comparators switch in the same step) never settles: after 30 iterations take
      // half steps, which break the cycle (the high-frequency inverter at −10 °C, found in
      // simulation). A converged point meets the same tolerances either way
      if (!conv && c.mode === 'tran' && it > 30) for (let i = 0; i < b.length; i++) b[i] = x[i] + 0.5 * (b[i] - x[i]);
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

  /** Operating point; devices with a discrete state are settled (at most 20 changes). */
  private solveDc(over: Partial<Ctx> = {}, fromScratch = true): Ctx {
    let c = this.solveDc1(over, fromScratch);
    for (let k = 0; k < 20; k++) {
      const st = this.devices.filter((d) => d.pending?.(c.x));
      if (!st.length) return c;
      for (const d of st) d.commitState!(c.x);
      this.x = c.x;
      c = this.solveDc1(over, false);
    }
    if (this.devices.some((d) => d.pending?.(c.x)))
      this.warnings.push('no stable DC operating point: the circuit oscillates (a 555 astable?). Use a transient analysis starting with the capacitors discharged.');
    return c;
  }

  /** Operating point with GMIN stepping and source stepping when plain Newton fails. */
  private solveDc1(over: Partial<Ctx> = {}, fromScratch = true): Ctx {
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
  tran(tstep: number, tstop: number, tmax?: number, maxPoints = 200000, uic = false, thin = false): Waveforms {
    if (!(tstep > 0 && tstop > 0)) throw new SimError('transient: step and stop time must be > 0');
    this.warnings = [];
    let c = uic ? this.solveDc1({ t: 0, uic: true }) : this.solveDc({ t: 0 });
    if (uic && this.devices.some((d) => d.pending?.(c.x))) {
      // a discrete state set by the start values (a 555 triggered by its empty capacitor):
      // solve t = 0 again with it, so the first point's voltages and currents agree
      for (const d of this.devices) d.commitState?.(c.x);
      this.x = c.x;
      c = this.solveDc1({ t: 0, uic: true }, false);
    }
    this.x = c.x;
    for (const d of this.devices) d.initTran?.(c.x);
    const out = this.newWaveforms();
    for (const d of this.devices) d.accept?.(c, c.x);
    this.record(c, out, 0);
    const hmax = Math.min(tmax ?? tstep, tstop / 50);
    const hmin = tstop * 1e-12;
    const hEvent = Math.max(hmax * 1e-3, tstop * 1e-9);
    const bps = new Set<number>([tstop]);
    for (const b of this.breaks) {
      const e = b.wave as Element & { kind: 'V' | 'I' };
      for (const t of breakpoints(e.wave, tstop)) if (t > 0) bps.add(t);
    }
    const sorted = [...bps].sort((a, b) => a - b);
    let bi = 0;
    // start with small steps: a switch-on (uic) or a source corner at t = 0 is often fast
    let t = 0, h = Math.min(hmax, sorted[0]) / (uic ? 1000 : 10), afterBreak = true, damp = false;
    const eps = tstop * 1e-12;
    while (t < tstop - eps) {
      while (bi < sorted.length && sorted[bi] <= t + eps) bi++;
      const nb = sorted[bi] ?? tstop;
      const hh = Math.min(h, nb - t);
      c = this.ctx({ mode: 'tran', t: t + hh, h: hh, method: afterBreak || damp ? 'be' : 'trap', x: this.x });
      // 100 iterations: a comparator output transistor entering saturation creeps tens of mV per
      // iteration and needed more than 50 (the step then shrank until the matrix lost precision)
      const it = this.newton(c, 100, false);
      const stats = (globalThis as { __simStats?: Record<string, number> }).__simStats;
      if (stats) stats[it < 0 ? 'newtonFail' : 'solve'] = (stats[it < 0 ? 'newtonFail' : 'solve'] ?? 0) + 1;
      if (it < 0) {
        h = hh / 8;
        // before giving up: once for the rest of the run, refine every linear solve (a floating
        // circuit, tied to ground only weakly, lost Newton's convergence in round-off as the
        // step shrank), and try again from a moderate step
        if (h < hmin && !this.refine) { this.refine = true; h = hEvent; continue; }
        if (h < hmin) {
          const e = new SimError(`transient: time step too small at t = ${t.toExponential(3)} s (no convergence${this.noConv ? `, last at the ${this.noConv}` : ''})`);
          e.partial = out;
          throw e;
        }
        continue;
      }
      // truncation error: reject a step that is too long for the reactive parts
      let hLte = Infinity;
      for (const d of this.devices) if (d.lte) hLte = Math.min(hLte, d.lte(c.x, c));
      if (hLte < 0.9 * hh && hh > hmin * 10) {
        if (stats) { let worst = ''; let w = Infinity; for (const d of this.devices) { const l = d.lte?.(c.x, c) ?? Infinity; if (l < w) { w = l; worst = d.el.name.replace(/_.*/, ''); } } stats[`lte:${worst}`] = (stats[`lte:${worst}`] ?? 0) + 1; }
        h = Math.max(hLte * 0.9, hh / 8, hmin * 10); continue;
      }
      // a discrete state (555 latch) would change: find the instant to within hEvent first
      const flips = this.devices.filter((d) => d.pending?.(c.x));
      if (stats) for (const d of flips) stats[`flip:${d.el.name.replace(/_.*/, '')}`] = (stats[`flip:${d.el.name.replace(/_.*/, '')}`] ?? 0) + 1;
      if (flips.length && hh > hEvent) { h = Math.max(hh / 4, hEvent); continue; }
      if (stats) { stats.accepted = (stats.accepted ?? 0) + 1; const b = `h:1e${Math.floor(Math.log10(hh))}`; stats[b] = (stats[b] ?? 0) + 1; }
      this.x = c.x;
      for (const d of this.devices) d.accept?.(c, c.x);
      t += hh;
      // thin: keep a point only once a print step has passed since the last one kept
      if (!thin || t - out.x[out.x.length - 1] >= tstep * (1 - 1e-9) || t >= tstop - eps) this.record(c, out, t);
      if (out.x.length > maxPoints) throw new SimError(`transient: more than ${maxPoints} time points; use a larger step`);
      afterBreak = Math.abs(t - nb) <= eps;
      h = it <= 6 ? Math.min(hmax, hh * 2) : it > 20 ? hh / 2 : hh;
      h = Math.min(h, Math.max(0.9 * hLte, hh / 8));
      if (flips.length) { for (const d of flips) d.commitState!(c.x); afterBreak = true; }
      // trapezoidal ringing (a stiff loop the step has outgrown: a capacitor's current flips
      // sign every step): one backward-Euler step at the same size damps it
      damp = !afterBreak && this.devices.some((d) => d.rings?.());
      if (afterBreak) {
        h = Math.min(h, hmax / 10); // restart small after a source corner or a state change
        for (const d of this.devices) d.resetHistory?.();
      }
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
