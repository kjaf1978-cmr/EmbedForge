# Technical reference: analyses

The four basic analyses (operating point, DC sweep, transient, AC) are described on the
[engine page](#doc:tech-engine). This page covers what is built on them: the DC sweep, the
parameter sweep (with the temperature sweep), the tolerance analysis, the stress check and the
waveform measurements (with the pulse measurements).
Source: `sim/run.ts`, `eda/smoke.ts`, `sim/measure.ts`.

## DC sweep

A DC sweep solves the operating point for each value of a source voltage or a resistor. Each
point starts from the previous solution, which makes the sweep fast and keeps it on the same
branch of a circuit with several solutions (a latch, a Schmitt trigger).

## Parameter sweep (.step)

The analysis runs once per value, or per combination of values, of up to three part
properties: any numeric property, or a model choice ("1N4148 1N4007").

**Values.** A list, a linear range (from, to, step) or a range per decade (from, to, points per
decade):

@code sim/run.ts stepValues

**Runs.** With several properties every combination runs, the first property varying fastest:
run index r is decomposed into one index per property, r = i₀ + n₀·(i₁ + n₁·i₂). At most 50 runs.
Each run is an ordinary simulation of a copy of the sheet with the properties changed.

**Temperature.** The circuit temperature can be one of the stepped properties: each run then
sets the sheet's temperature instead of a part property, and the engine adjusts every model to
it (see [device models](#doc:tech-models)). An operating point stepped over temperature gives
each voltage and current against T, as SPICE's `.dc temp` does.

@code sim/run.ts withProp

**Combining the runs.** For an operating point, the result becomes a sweep over the first
property's values, with one curve per combination of the other properties. Transient, AC and
DC sweep runs are overlaid on one x axis. A transient's time points differ from run to run, so
every run is resampled, by linear interpolation, onto an even time grid as fine as the finest
run (2000 to 20 000 points):

@code sim/run.ts simulateStepped

@code sim/run.ts overlayRuns

@code sim/run.ts resample

## Tolerance analysis (Monte Carlo)

Real resistors, capacitors and inductors differ from their nominal value within a tolerance.
The tolerance analysis runs the circuit many times, each time with every such value drawn at
random within its tolerance, and shows the spread of the results.

**Random numbers.** A seeded generator (mulberry32, a 32-bit generator with a period of 2³²)
gives the same sequence for the same seed, so a run can be repeated exactly:

@code sim/run.ts rng

**Distributions.** For a tolerance t the value is v·(1 + t·d) with d in [−1, 1]:

- *even:* d uniform in [−1, 1];
- *Gaussian:* d normal with standard deviation 1/3, so the tolerance is 3 σ (99.7 % of parts
  inside it), clipped at ±1. Normal numbers come from the Box–Muller transform
  z = √(−2·ln u₁)·cos(2π·u₂) of two uniform numbers u₁, u₂.

Run 1 always uses the nominal values.

@code sim/run.ts monteCarloSheets

The runs are combined like those of a parameter sweep; for an operating point the x axis is the
run number, and the Min, Max and Average columns of the waveform table give the spread.

## Stress check (smoke analysis)

The stress check compares, after a simulation, every part's voltages, currents and power with
its maximum ratings, as PSpice's smoke analysis does.

**Quantities.** From the result, for each part: the voltage across its pins, the current into
each pin, and the power P(t) = Σ v_pin(t)·i_pin(t) (the sum over its pins of the pin voltage
times the current into the pin is the power the part takes in).

**Peak or average.** Voltages and currents are compared at their peak, because a junction or a
dielectric fails at once. Power and rectifier current are compared as averages over the run,
because they heat the part with a time constant much longer than a signal period. A
transient's average is time-weighted:

@code eda/smoke.ts mean

**Ratings.** Datasheet absolute maximum ratings of the built-in models (TO-92 and TO-220 in free
air); resistors, capacitors, inductors and switches carry their rating as a property. A part
above the warning level (default 80 % of its rating) is a warning, above 100 % an error.

@code eda/smoke.ts smoke

## Waveform measurements

For the visible range of each trace the waveform table shows minimum, maximum, peak-to-peak,
average, RMS and frequency. The time points of a transient are not evenly spaced, so the
average and the RMS value are integrals over the piecewise-linear waveform:

    average = (1/T)·∫ y dt        RMS = √((1/T)·∫ y² dt)

For a straight segment from (x_a, y_a) to (x_b, y_b) the integrals are exact:
∫ y dt = h·(y_a + y_b)/2 and ∫ y² dt = h·(y_a² + y_a·y_b + y_b²)/3.

The frequency counts rising crossings of the middle level (half-way between minimum and
maximum) with a hysteresis of 10 % of the peak-to-peak value, so noise near the middle level
does not count twice; the crossing time is interpolated between points.

@code sim/measure.ts measure

### Pulse measurements

The **Pulse** table measures a transient as an oscilloscope does.

**Levels.** The base and top are the levels the waveform spends most time at: a time-weighted
histogram of 100 bins between the minimum and maximum, where each segment's time is spread over
the bins it passes; the fullest bin in the lower and in the upper half gives the base and the
top, refined to the time-weighted mean of the points in that bin and its neighbours. When the
fullest bin holds less than 5 % of the time (no flat level), or it is the outermost bin, the
minimum or maximum is used instead. A square wave with ringing then has its settled levels as
base and top; a sine has its peaks.

@code sim/measure.ts levels

**Edges.** With A = top − base, a rise runs from the last upward crossing of base + 0.1·A to the
next upward crossing of base + 0.9·A; a fall from the last downward crossing of 90 % to the next
of 10 %. Crossing times are interpolated on the segment. An exponential edge (RC) gives
t_r = RC·ln 9 ≈ 2.2·RC.

**Period and duty cycle** come from crossings of the 50 % level, each armed by a visit to the
10 % (rising) or 90 % (falling) level, so noise and ringing near the middle do not count twice:
the period is the mean time between rising crossings, and the duty cycle the mean time from a
rising crossing to the next falling one, divided by the period.

**Overshoot and undershoot** are (max − top)/A and (base − min)/A in %. For a second-order step
response with damping ratio ζ the overshoot is e^(−ζπ/√(1−ζ²)).

@code sim/measure.ts timing
