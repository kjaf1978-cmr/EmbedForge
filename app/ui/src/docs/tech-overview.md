# Technical reference: overview and modules

This part of the help describes how NETApps Electric Simulation works inside: the theory behind
each function, the modules that implement it and their code. The code shown on these pages is
taken from the program's source when the app is built, so it is always the code that runs.

Pages of the technical reference:

- [Simulator engine](#doc:tech-engine): circuit equations, Newton–Raphson, operating point,
  transient integration and step control, AC analysis.
- [Device models](#doc:tech-models): the equations of every part.
- [Analyses](#doc:tech-analyses): DC sweep, parameter sweep, tolerance analysis (Monte Carlo),
  stress check (smoke analysis), waveform measurements.
- [FFT and harmonics](#doc:tech-fft): spectrum, window, amplitude and frequency measurement,
  total harmonic distortion.
- [Verification](#doc:tech-verification): how the results are checked against ngspice and
  exact values.

## From the drawing to the waveform

A simulation passes through these steps; each is a separate module with a defined input and
output.

| Step | Module | Input → output |
|---|---|---|
| 1. Drawing | `eda/schematic.ts`, `eda/editor.ts` | user edits → *sheet*: parts, wires, labels, probes, settings |
| 2. Connectivity | `eda/connectivity.ts` | sheet → *nets*: which pins are joined (wires, junctions, labels, rails) |
| 3. Rule check | `eda/erc.ts` | sheet + nets → findings (unconnected pins, floating nets, shorts…) |
| 4. Flattening | `eda/simnet.ts` | sheet + nets → *circuit*: primitive elements (R, C, L, V, I, E, G, D, Q, M, K, W, behavioural) |
| 5. Analysis plan | `eda/simnet.ts` (`planAnalysis`) | simulation settings → analysis with numbers (stop time, frequencies…) |
| 6. Engine | `sim/engine.ts`, `sim/linalg.ts` | circuit + analysis → waveforms of every node voltage and element current |
| 7. Mapping back | `sim/run.ts` | waveforms → results by net name and by part pin |
| 8. Repeated runs | `sim/run.ts` | parameter sweep, Monte Carlo: many runs → overlaid results |
| 9. Post-processing | `sim/measure.ts`, `sim/fft.ts`, `eda/smoke.ts` | results → measurements, spectrum, THD, stress |
| 10. Display | `components/schematic/Plot.tsx`, `SchematicView.tsx` | results → plots, tables, values on the sheet |

Steps 4 to 9 run in a background thread (`sim/worker.ts`, `sim/client.ts`), so the editor stays
responsive during a long simulation.

## Module map

| Module | What it does |
|---|---|
| `eda/units.ts` | engineering values: parsing "4k7", "100n", "2.2meg"; formatting |
| `eda/symbols.ts` | the part library: pins, drawing, properties and their limits |
| `eda/models.ts` | model parameters of the built-in parts (diodes, transistors, op-amps, regulators, relays) |
| `eda/spicemodel.ts` | reading a SPICE `.model` line into a model |
| `eda/simnet.ts` | parts → primitive elements; rails; isolated islands; the analysis plan |
| `eda/smoke.ts` | stress check against maximum ratings |
| `eda/bom.ts` | bill of materials |
| `sim/circuit.ts` | the element types and source waveforms (SIN, PULSE, PWL) |
| `sim/engine.ts` | the simulator: devices, Newton–Raphson, operating point, transient, AC |
| `sim/linalg.ts` | dense LU solution of the linear equations (real and complex) |
| `sim/spice.ts` | SPICE netlist export (the same circuit for ngspice or LTspice) |
| `sim/run.ts` | runs an analysis on a sheet; parameter sweep; Monte Carlo |
| `sim/measure.ts` | min, max, average, RMS, peak-to-peak, frequency of a trace |
| `sim/fft.ts` | spectrum and harmonic distortion |

## The common data of a result

Every analysis returns the same structure, so plots, measurements, the FFT and the stress
check work on all of them:

@code sim/run.ts SimResult
