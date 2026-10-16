// LU solvers on dense storage with threshold partial pivoting. Circuits within the DATA-04 limits
// give matrices of at most a few hundred unknowns; the elimination skips zeros, and a
// fill-reducing order (minimum degree) keeps the factors sparse for the larger power designs.

/** Solves A·x = b in place (A is n×n row-major and is destroyed). Returns false when singular. */
const PIV_REL = 1e-3;
let colsBuf = new Int32Array(0);
export function solveReal(A: Float64Array, b: Float64Array, n: number): boolean {
  if (colsBuf.length < n) colsBuf = new Int32Array(n);
  const cols = colsBuf;
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > max) { max = v; p = i; }
    }
    if (!(max > 1e-300)) return false;
    // threshold pivoting (as SPICE): keep the diagonal unless it is much smaller than the
    // largest entry, so the fill-reducing order is kept
    if (Math.abs(A[k * n + k]) >= PIV_REL * max) p = k;
    if (p !== k) {
      for (let j = k; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[k]; b[k] = b[p]; b[p] = t;
    }
    const piv = A[k * n + k], rk = k * n;
    // circuit matrices are sparse: update only the columns where the pivot row is non-zero
    let m = 0;
    for (let j = k + 1; j < n; j++) if (A[rk + j] !== 0) cols[m++] = j;
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / piv;
      if (f === 0) continue;
      A[i * n + k] = 0;
      const ri = i * n;
      for (let q = 0; q < m; q++) { const j = cols[q]; A[ri + j] -= f * A[rk + j]; }
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
  return true;
}

/** Complex version: A = Ar + j·Ai, b = br + j·bi; the solution is left in br, bi. */
export function solveComplex(Ar: Float64Array, Ai: Float64Array, br: Float64Array, bi: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.hypot(Ar[k * n + k], Ai[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.hypot(Ar[i * n + k], Ai[i * n + k]);
      if (v > max) { max = v; p = i; }
    }
    if (!(max > 1e-300)) return false;
    if (p !== k) {
      for (let j = k; j < n; j++) {
        let t = Ar[k * n + j]; Ar[k * n + j] = Ar[p * n + j]; Ar[p * n + j] = t;
        t = Ai[k * n + j]; Ai[k * n + j] = Ai[p * n + j]; Ai[p * n + j] = t;
      }
      let t = br[k]; br[k] = br[p]; br[p] = t;
      t = bi[k]; bi[k] = bi[p]; bi[p] = t;
    }
    const pr = Ar[k * n + k], pi = Ai[k * n + k];
    const d = pr * pr + pi * pi;
    for (let i = k + 1; i < n; i++) {
      const ar = Ar[i * n + k], ai = Ai[i * n + k];
      if (ar === 0 && ai === 0) continue;
      // f = a / piv
      const fr = (ar * pr + ai * pi) / d, fi = (ai * pr - ar * pi) / d;
      Ar[i * n + k] = 0; Ai[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) {
        const xr = Ar[k * n + j], xi = Ai[k * n + j];
        Ar[i * n + j] -= fr * xr - fi * xi;
        Ai[i * n + j] -= fr * xi + fi * xr;
      }
      const yr = br[k], yi = bi[k];
      br[i] -= fr * yr - fi * yi;
      bi[i] -= fr * yi + fi * yr;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = br[i], si = bi[i];
    for (let j = i + 1; j < n; j++) {
      const ar = Ar[i * n + j], ai = Ai[i * n + j];
      sr -= ar * br[j] - ai * bi[j];
      si -= ar * bi[j] + ai * br[j];
    }
    const pr = Ar[i * n + i], pi = Ai[i * n + i];
    const d = pr * pr + pi * pi;
    br[i] = (sr * pr + si * pi) / d;
    bi[i] = (si * pr - sr * pi) / d;
  }
  return true;
}

/** A fill-reducing order of the unknowns (greedy minimum degree on the symmetric pattern of A):
 *  eliminating them in this order keeps the LU factors of a circuit matrix sparse. */
export function minDegreeOrder(A: Float64Array, n: number): Int32Array {
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && (A[i * n + j] !== 0 || A[j * n + i] !== 0)) adj[i].add(j);
  const done = new Uint8Array(n), order = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let best = -1, deg = Infinity;
    for (let v = 0; v < n; v++) if (!done[v] && adj[v].size < deg) { deg = adj[v].size; best = v; }
    order[k] = best; done[best] = 1;
    // eliminating best joins its neighbours into a clique
    const nb = [...adj[best]];
    for (const a of nb) { adj[a].delete(best); for (const c of nb) if (c !== a) adj[a].add(c); }
    adj[best].clear();
  }
  return order;
}

/** solveReal on the unknowns taken in the order `perm` (a symmetric permutation of A). */
export function solveRealOrdered(A: Float64Array, b: Float64Array, n: number, perm: Int32Array): boolean {
  const Ap = new Float64Array(n * n), bp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ri = perm[i] * n, rp = i * n;
    for (let j = 0; j < n; j++) Ap[rp + j] = A[ri + perm[j]];
    bp[i] = b[perm[i]];
  }
  if (!solveReal(Ap, bp, n)) return false;
  for (let i = 0; i < n; i++) b[perm[i]] = bp[i];
  return true;
}

/** Sparse LU for the transient and DC analyses: the matrix is assembled in dense storage and
 *  taken in a fill-reducing order; the elimination keeps, for every row and column, the list of
 *  its non-zero entries (fill-in included), so its cost follows the non-zeros instead of n².
 *  Threshold partial pivoting as solveReal. Work arrays are kept between solves. */
export class SparseSolver {
  private n: number;
  private perm: Int32Array;
  private inv: Int32Array;
  private W: Float64Array;
  private mark: Uint8Array;
  private rowCols: Int32Array[];
  private rowLen: Int32Array;
  private colRows: Int32Array[];
  private colLen: Int32Array;
  private bb: Float64Array;
  private xs: Float64Array;
  private alive: Uint8Array;
  private piv: Int32Array;
  constructor(perm: Int32Array) {
    const n = perm.length;
    this.n = n; this.perm = perm; this.inv = new Int32Array(n);
    for (let i = 0; i < n; i++) this.inv[perm[i]] = i;
    this.W = new Float64Array(n * n); this.mark = new Uint8Array(n * n);
    this.rowCols = Array.from({ length: n }, () => new Int32Array(8)); this.rowLen = new Int32Array(n);
    this.colRows = Array.from({ length: n }, () => new Int32Array(8)); this.colLen = new Int32Array(n);
    this.bb = new Float64Array(n); this.xs = new Float64Array(n); this.alive = new Uint8Array(n); this.piv = new Int32Array(n);
  }
  private pushRow(i: number, j: number) {
    let a = this.rowCols[i];
    if (this.rowLen[i] === a.length) { const b = new Int32Array(a.length * 2); b.set(a); this.rowCols[i] = a = b; }
    a[this.rowLen[i]++] = j;
  }
  private pushCol(j: number, i: number) {
    let a = this.colRows[j];
    if (this.colLen[j] === a.length) { const b = new Int32Array(a.length * 2); b.set(a); this.colRows[j] = a = b; }
    a[this.colLen[j]++] = i;
  }
  // the pattern's entries grouped by (reordered) row: index into A and column, per row
  private patLen = -1;
  private pRowStart = new Int32Array(0);
  private pIdx = new Int32Array(0);
  private pCol = new Int32Array(0);
  private groupPattern(pat: { list: Int32Array; len: number }) {
    const n = this.n, inv = this.inv, cnt = new Int32Array(n + 1);
    for (let q = 0; q < pat.len; q++) cnt[inv[(pat.list[q] / n) | 0] + 1]++;
    for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
    this.pRowStart = cnt.slice();
    this.pIdx = new Int32Array(pat.len); this.pCol = new Int32Array(pat.len);
    const fill = cnt.slice();
    for (let q = 0; q < pat.len; q++) {
      const k = pat.list[q], r = inv[(k / n) | 0], at = fill[r]++;
      this.pIdx[at] = k; this.pCol[at] = inv[k % n];
    }
    this.patLen = pat.len;
  }
  /** Solves A·x = b (A is n×n row-major, unchanged); x replaces b. False when singular.
   *  With `pat`, the positions of every non-zero of A: only those are read. */
  solve(A: Float64Array, b: Float64Array, pat?: { list: Int32Array; len: number }): boolean {
    const n = this.n, W = this.W, mark = this.mark, perm = this.perm, inv = this.inv;
    // clear what the last solve left
    for (let r = 0; r < n; r++) {
      const cols = this.rowCols[r], m = this.rowLen[r], base = r * n;
      for (let q = 0; q < m; q++) { const j = cols[q]; W[base + j] = 0; mark[base + j] = 0; }
      this.rowLen[r] = 0; this.colLen[r] = 0;
    }
    // load in the fill-reducing order
    if (pat) {
      if (pat.len !== this.patLen) this.groupPattern(pat);
      const rs = this.pRowStart, pi = this.pIdx, pc = this.pCol;
      for (let i = 0; i < n; i++) {
        const base = i * n;
        for (let q = rs[i]; q < rs[i + 1]; q++) {
          const v = A[pi[q]];
          if (v === 0) continue;
          const j = pc[q];
          W[base + j] = v; mark[base + j] = 1;
          this.pushRow(i, j); this.pushCol(j, i);
        }
        this.bb[i] = b[perm[i]]; this.alive[i] = 1;
      }
    } else for (let i = 0; i < n; i++) {
      const src = perm[i] * n, base = i * n;
      for (let c = 0; c < n; c++) {
        const v = A[src + c];
        if (v === 0) continue;
        const j = inv[c];
        W[base + j] = v; mark[base + j] = 1;
        this.pushRow(i, j); this.pushCol(j, i);
      }
      this.bb[i] = b[perm[i]]; this.alive[i] = 1;
    }
    const bb = this.bb, alive = this.alive;
    for (let k = 0; k < n; k++) {
      const rows = this.colRows[k], nr = this.colLen[k];
      let max = 0, p = -1;
      for (let q = 0; q < nr; q++) {
        const i = rows[q];
        if (!alive[i]) continue;
        const v = Math.abs(W[i * n + k]);
        if (v > max) { max = v; p = i; }
      }
      if (!(max > 1e-300)) return false;
      if (alive[k] && Math.abs(W[k * n + k]) >= PIV_REL * max) p = k;
      alive[p] = 0; this.piv[k] = p;
      const rp = p * n, pk = W[rp + k], pcols = this.rowCols[p], pm = this.rowLen[p];
      for (let q = 0; q < nr; q++) {
        const i = rows[q];
        if (!alive[i]) continue;
        const ri = i * n, f = W[ri + k] / pk;
        if (f === 0) continue;
        W[ri + k] = 0;
        for (let t = 0; t < pm; t++) {
          const j = pcols[t];
          if (j <= k) continue;
          const u = W[rp + j];
          if (u === 0) continue;
          if (!mark[ri + j]) { mark[ri + j] = 1; this.pushRow(i, j); this.pushCol(j, i); }
          W[ri + j] -= f * u;
        }
        bb[i] -= f * bb[p];
      }
    }
    const xs = this.xs;
    for (let k = n - 1; k >= 0; k--) {
      const p = this.piv[k], rp = p * n, cols = this.rowCols[p], m = this.rowLen[p];
      let s = bb[p];
      for (let t = 0; t < m; t++) { const j = cols[t]; if (j > k) s -= W[rp + j] * xs[j]; }
      xs[k] = s / W[rp + k];
    }
    for (let k = 0; k < n; k++) b[perm[k]] = xs[k];
    return true;
  }
}
