// The sparse LU of the simulator: solving, and the iterative refinement the transient switches on
// when it would otherwise fail (a floating circuit tied to ground only weakly).
import { describe, expect, it } from 'vitest';
import { SparseSolver } from '../src/sim/linalg';

/** A conductance between nodes i and j (or to ground, j < 0). */
function system(n: number, branches: [number, number, number][], inject: [number, number][]) {
  const A = new Float64Array(n * n), b = new Float64Array(n);
  for (const [i, j, g] of branches) {
    A[i * n + i] += g;
    if (j >= 0) { A[j * n + j] += g; A[i * n + j] -= g; A[j * n + i] -= g; }
  }
  for (const [i, v] of inject) b[i] += v;
  const list = Int32Array.from([...A.keys()].filter((k) => A[k] !== 0));
  return { A, b, pat: { list, len: list.length } };
}

describe('sparse LU', () => {
  it('solves a resistor network (1 A into 1 Ω + 1 Ω to ground: 2 V, 1 V)', () => {
    const { A, b, pat } = system(2, [[0, 1, 1], [1, -1, 1]], [[0, 1]]);
    const s = new SparseSolver(Int32Array.from([0, 1])), x = b.slice();
    expect(s.solve(A, x, pat)).toBe(true);
    expect(x[0]).toBeCloseTo(2, 12);
    expect(x[1]).toBeCloseTo(1, 12);
  });
  it('refinement with an extended-precision residual: a stiff island tied to ground by 10 µS is solved 30 times more accurately', () => {
    // nodes 3–5: 1 MS and 100 MS inside, 10 µS to ground; 1 µA into node 5 gives 0.1 V at node 3
    const { A, b, pat } = system(6, [[0, -1, 1], [0, 1, 1e4], [1, 2, 1], [2, -1, 1e-3], [3, 4, 1e6], [4, 5, 1e8], [3, -1, 1e-5]], [[0, 1], [5, 1e-6]]);
    const s = new SparseSolver(Int32Array.from([0, 1, 2, 3, 4, 5])), x = b.slice();
    expect(s.solve(A, x, pat)).toBe(true);
    const before = Math.abs(x[3] / 0.1 - 1);
    s.refine(A, b, x, pat);
    const after = Math.abs(x[3] / 0.1 - 1);
    expect(after).toBeLessThan(before / 10);
    expect(after).toBeLessThan(1e-5);
  });
});
