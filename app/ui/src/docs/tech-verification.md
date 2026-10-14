# Technical reference: verification

Every build of the app runs automatic checks of the simulator and of the functions built on it.
The checks are part of the source (`app/ui/tests`) and run on GitHub-hosted computers for every
change; a change that breaks one is not released.

## Cross-check with ngspice

ngspice is the reference SPICE simulator. The same circuit is simulated by NETApps and by
ngspice 42, and the results must agree within 1 % or 1 mV / 1 µA (for a transient also 1 % of
the signal's span, because the two simulators choose different time points near a fast edge).
The circuits are:

- 18 reference circuits covering each element and analysis: dividers, LED, Zener, transistor
  and MOSFET switches and amplifiers, op-amp transients, filters (AC), rectifiers,
  transformers in transient and AC, a relay with hysteresis;
- every example schematic that uses no behavioural part (12);
- schematic-level decks of the newer parts: DC motor start-up, transformers, three-phase
  transformer, induction motors, relay with flyback diode, imported SPICE models;
- the FFT: the harmonic levels of a diode clipper against ngspice's own FFT (Hann window),
  within 0.1 dB.

The comparison code:

@code sim/reference.ts RefCase

## Exact results

Parts and functions are also checked against values that can be calculated exactly, for
example: Ohm's law and dividers; RC charging with τ = RC; the 555 frequency 1.44/((R1 + 2R2)·C);
regulator output voltages; transformer ratios and the 30° phase shift of Dyn; DC motor no-load
speed V/(k + R_a·B/k) and start-up time constant J·R_a/k²; induction-motor current from the
equivalent circuit; logic truth tables; FFT amplitudes of sines and of the harmonics 4/(π·n) of a
square wave; Monte Carlo values staying inside their tolerances; parameter-sweep results
against the divider formula; stress values against P = V²/R.

## What the checks do not cover

- Effects the models leave out: junction capacitances (fast switching of diodes and
  transistors), temperature, core saturation of transformers, current limits of regulators,
  propagation delays of logic.
- Behavioural parts (555, logic, servo) have no SPICE counterpart; they are checked against
  their datasheet behaviour only.
- Ratings in the stress check are datasheet absolute maximums in free air; the real limit of a
  part on a board also depends on cooling.
