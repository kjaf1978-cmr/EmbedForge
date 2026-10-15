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
