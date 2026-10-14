# Circuit simulation

Press **F5** (or **Simulate**) to simulate the schematic. Choose the analysis in the
**Simulation** tab.

## Analyses

- **Operating point:** the DC state. Every net shows its voltage on the schematic; select a part
  to see its pin voltages, currents and power. LEDs light up according to their current (20 mA
  is full brightness).
- **Transient:** voltages and currents over time, from 0 to the stop time. The time step sets
  the resolution (empty: stop time / 1000).
- **AC sweep:** gain (dB) and phase over frequency, for small signals around the operating
  point: a Bode plot. The input is every source with an AC magnitude (sine sources have 1 V by
  default).
- **DC sweep:** sweeps the voltage of a source, the current of a current source or the value of
  a resistor, and plots the result against it.

With **Update live** on, the simulation runs again after every change. Click a switch on the
schematic to toggle it, hold a push-button down with the mouse (or select it and hold Space),
and set a potentiometer by dragging the arrow of its wiper on the sheet, with the mouse wheel
over it, or with its slider. The results follow while you drag, and the new position is kept
(one undo step) when you let go. The Controls list in the Simulation tab has the same controls
for the keyboard: arrow keys, Page Up/Down, Home and End move a slider.

## Parameter sweep

**Parameter sweep (.step)** in the Simulation tab runs the analysis once per value of one part
property, as LTspice's `.step` does: choose the property (for example C1 capacitance, R2
resistance or D1 model), then give a list of values or models separated by spaces, or a range
(from, to, step) or a range per decade. At most 25 runs. Every probe then shows one trace per
run, named after the value. An operating point with a sweep becomes a plot of the voltages and
currents against the swept value.

You can step up to three properties at once (**＋ Add a property**): every combination runs, at
most 50 runs, and each trace is named after its values.

## Tolerance analysis (Monte Carlo)

**Tolerance analysis** runs the analysis 2 to 50 times with every resistor, potentiometer,
capacitor and inductor value varied within its tolerance (set per kind of part, in %): Gaussian
with the tolerance as 3 σ, or evenly spread. Run 1 uses the drawn values. The same seed gives
the same runs, so a result can be repeated. An operating point shows each voltage and current
over the runs; the Min, Max and Average columns of the table give the spread.

## Stress check (smoke analysis)

After a simulation, the **Stress** tab compares every part with its maximum ratings: power of
resistors and potentiometers, voltage of capacitors (and reverse voltage of electrolytics),
current of inductors, switches and relay contacts, forward current, reverse voltage and power
of diodes and LEDs, collector or drain voltage, current and power of transistors and MOSFETs,
supply voltage and output current of op-amps, regulators and the 555. Peaks are used for
voltages and currents, averages over the run for power and rectifier current. Parts above the
warning level (default 80 % of the rating) are warnings, parts above the rating errors; both
also appear in the Checks list. The ratings of resistors, capacitors, inductors and switches
are properties of the part (for example a 0.25 W resistor).

## Probes and the waveform viewer

- **V** then click a wire or pin: the voltage of that net against ground. Drag from one net to
  another for the voltage between them.
- **I** then click a part pin: the current into the part at that pin. A source delivering
  power therefore shows a negative current at its + pin, as in SPICE.
- Without probes, the viewer shows the nets that have a name (labels and rails).

In the viewer: drag to zoom, the wheel zooms, **Zoom to fit** resets. Click to set cursor A,
Shift+click for cursor B; the table shows the values at both cursors, their difference, and the
minimum, maximum, average, RMS, peak-to-peak and frequency over the visible range.

The **FFT** button above a transient plot shows the spectrum of the visible range (zoom in on
the settled part first): Hann window, amplitudes as peak values in dBV or dBA, and per trace
the strongest component with its total harmonic distortion (harmonics 2 to 10).

## Models and accuracy

The simulator is a SPICE-style engine built into NETApps (modified nodal analysis, the
SPICE diode, bipolar and level-1 MOSFET equations). It is checked against ngspice on a
reference suite of circuits on every build: results agree within 1 % or 1 mV / 1 µA (SIM-04).
The time step of a transient follows the integration error of every capacitor and inductor, as
in SPICE.

- Diodes, LEDs and Zener diodes: SPICE diode model; LEDs from their forward voltage at 20 mA.
- **SPICE models:** diodes, Zeners, transistors and MOSFETs take a pasted `.model` line from a
  datasheet (property "SPICE model"). The parameters the simulator models are used; the others
  (junction capacitances, temperature) are listed as ignored. Level-1 MOSFET models only.
- Logic gates and the D flip-flop: CMOS-like, switching at half the supply rail (the Schmitt
  inverter at 60 % and 40 %), outputs through 50 Ω, no propagation delay. They are supplied from
  the rail named in their "Supply rail" property (hidden supply pins).
- Transistors: SPICE Gummel–Poon model without charge storage (DC, AC and switching at low
  frequency; no junction capacitances).
- MOSFETs: level-1 model with body diode. Power MOSFET models are approximations fitted to the
  threshold voltage and the on-resistance.
- Op-amps: macro model with gain, one pole (gain–bandwidth), input and output resistance, and
  an output that stops short of the supply rails by the amount the model states (LM358: 1.5 V
  below V+, 0.1 V above V−). Supply current is not modelled.
- A part, or a group of parts, connected to nothing else is tied to ground at one point. No
  current can flow through that tie, so it changes no result; it only keeps the simulator from
  failing on a part you have not wired yet.
- Transformers: two coupled windings (mutual inductance), with winding resistances and a
  coupling below 1 for leakage. Three-phase transformers are three such winding pairs, wired
  in delta or star as chosen (Dyn and Yd shift the phase by 30°). No core saturation.
- Relays: coil resistance and inductance; the contact changes over at 75 % of the nominal coil
  current and back at 25 %. Switch the coil with a flyback diode.
- DC motor: armature resistance and inductance, back-EMF, torque, inertia, friction and load
  torque; the SPD pin gives the speed. AC motors: the per-phase equivalent circuit at the slip
  you set (running state; no start-up). Servo: decodes 1 to 2 ms pulses and turns at the set
  speed; it has no SPICE equivalent.
- Transformers and AC motors on an AC supply: start the transient with **discharged capacitors
  (power-on)**. From the DC operating point their windings are short circuits, and the run would
  start with large DC currents that take seconds to decay; the Simulation tab warns about it.
- A power rail with no source on it is driven by an ideal supply at the voltage in its name
  (+5V → 5 V); the Simulation tab says so.

**Export → SPICE netlist** writes the same circuit for ngspice or LTspice.
