# Technical reference: simulator engine

The simulator is a SPICE-type engine: it writes Kirchhoff's current law for every node as a
system of equations (modified nodal analysis), solves non-linear parts by Newton–Raphson
iteration, and integrates capacitors and inductors over time with backward Euler and
trapezoidal steps. Source: `sim/engine.ts`.

## 1. Modified nodal analysis (MNA)

The unknowns are the voltage of every node against ground (node 0) and the current of every
element whose current cannot be written from voltages: voltage sources, inductors and
voltage-controlled voltage sources ("branch currents"). For N nodes and B branches this gives
a linear system of N + B equations

    A · x = z        x = [v₁ … v_N, i₁ … i_B]

Each element adds ("stamps") its contribution to A and z. A conductance g between nodes a and
b adds g to A[a][a] and A[b][b] and −g to A[a][b] and A[b][a]:

@code sim/engine.ts stampG

A voltage source between p and q with branch k adds the rows and columns that force
v(p) − v(q) = V and carry its current i_k into the node equations. Every node also gets a tiny
conductance to ground (GSHUNT = 10⁻¹² S, as ngspice's `rshunt`), so a node connected only
through capacitors still has a defined DC voltage.

The system is solved by LU decomposition with partial pivoting (`sim/linalg.ts`). Circuits of
the size a schematic holds give at most a few hundred unknowns, where a dense solver is fast.

## 2. Non-linear parts: Newton–Raphson

A diode current i(v) is not linear. Newton–Raphson replaces it, at the present estimate v₀, by
its tangent: a conductance g = di/dv in parallel with a current source,

    i ≈ i₀ + g·(v − v₀)

which is stamped like a linear part:

@code sim/engine.ts stampJ

The system is solved, the tangents are evaluated again at the new solution, and so on until
the solution stops changing. Convergence requires, as in SPICE,

- every unknown to change by less than RELTOL·|x| + VNTOL (voltages) or + ABSTOL (currents),
  with RELTOL = 10⁻³, VNTOL = 1 µV, ABSTOL = 1 pA;
- every device's linearised current to agree with its exact current at the solution;
- no junction voltage to have been limited in the last iteration.

@code sim/engine.ts Engine.newton

**Junction limiting.** An exponential diode current overflows when an iteration jumps far up
the curve. SPICE's `pnjlim` limits each step of a junction voltage to a logarithmic increase
above the critical voltage V_crit = n·V_T·ln(n·V_T / (√2·I_S)); MOSFET gate and drain voltages
are limited by `fetlim` and `limvds` in the same way.

@code sim/engine.ts pnjlim

## 3. Operating point

The DC operating point solves the circuit with capacitors open and inductors shorted. When
plain Newton–Raphson does not converge, the engine uses SPICE's two continuation methods:

1. **GMIN stepping:** a large conductance (10⁻² S) to ground is added at every node and reduced
   by decades to zero; each solution starts the next one.
2. **Source stepping:** all sources are ramped from 0 to 100 % in 5 % steps.

@code sim/engine.ts Engine.solveDc1

**Parts with a discrete state** (the 555 latch, logic gates, relay contacts) are settled after
the operating point: when the solution would change a state, the state is changed and the
operating point solved again, at most 20 times. A circuit that keeps changing (an oscillator)
gets a warning.

@code sim/engine.ts Engine.solveDc

## 4. Transient analysis

### Integration

A capacitor's i = C·dv/dt and an inductor's v = L·di/dt are replaced, for one time step h, by
algebraic *companion models* (a conductance and a source), using the values v₋, i₋ of the last
accepted time point:

| Method | Capacitor | Inductor |
|---|---|---|
| Backward Euler (order 1) | i = (C/h)·(v − v₋) | v = (L/h)·(i − i₋) |
| Trapezoidal (order 2) | i = (2C/h)·(v − v₋) − i₋ | v = (2L/h)·(i − i₋) − v₋ |

The trapezoidal rule is used normally; after a source corner (a pulse edge) or a change of a
discrete state the first step uses backward Euler, which does not ring after a jump.

@code sim/engine.ts Capacitor

### Step control

The time step adapts to the circuit:

- **Truncation error (as SPICE's CKTterr).** For every capacitor and inductor the error of the
  step is estimated from the divided differences of its charge q = C·v or flux φ = L·i over the
  last points: for the trapezoidal rule ε ≈ h³·|q‴|/12, for backward Euler ε ≈ h²·|q″|/2. The
  step is accepted when ε ≤ TRTOL·tol·h (TRTOL = 7, tol from RELTOL, ABSTOL and the charge
  tolerance 10⁻¹⁴ C); otherwise it is repeated with the step the error allows.
- **Convergence.** A step whose Newton iteration fails is repeated with h/8; a step that needed
  few iterations lets the next one double (at most to the largest step), many iterations halve
  it.
- **Breakpoints.** Pulse corners and the stop time are hit exactly.
- **Events.** When a discrete state (a 555 latch, a gate output, a relay contact) would change,
  the step is shortened until the moment is found to within a small fraction of the step, then
  the state changes.

@code sim/engine.ts lteStep

@code sim/engine.ts Engine.tran

### Start of the transient

A transient normally starts from the operating point. With **discharged capacitors
(power-on)** it starts with every capacitor at 0 V and every inductor at 0 A (SPICE `uic`), with
very small first steps; discrete states set by these start values (a 555 triggered by its empty
capacitor) are settled first and t = 0 is solved again.

## 5. AC analysis

The AC analysis linearises the circuit at its operating point (every non-linear part becomes
its small-signal conductances) and solves, at each frequency f with ω = 2πf, the complex system

    (G + jωC) · x = b

where capacitors add jωC, inductors −jωL in their branch rows, and sources their AC magnitude
and phase. Results are complex: the waveform viewer shows magnitude in dB and phase.

@code sim/engine.ts Engine.ac

## 6. Isolated parts

A group of nodes with no element path to ground (a part not wired yet, a floating transformer
secondary) is held only by the 10⁻¹² S shunts. Next to an ordinary conductance that is below
the precision of double-precision numbers, and the matrix becomes singular in practice. The
flattening step ties one node of each such island to ground with a resistor; with a single
connection no current can flow through it, so the results do not change.

@code eda/simnet.ts tieIslands
