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
(from, to, step) or a range per decade. At most 50 runs. Every probe then shows one trace per
run, named after the value. An operating point with a sweep becomes a plot of the voltages and
currents against the swept value.

You can step up to three properties at once (**＋ Add a property**): every combination runs, at
most 50 runs, and each trace is named after its values.

## Temperature

**Temperature** in the Simulation tab sets the circuit temperature in °C, as SPICE's `.temp`
does; empty means 27 °C, the temperature at which every model is given. Diodes, LEDs, transistors
and MOSFETs follow the SPICE temperature equations: a silicon diode's forward voltage falls by
about 2 mV per kelvin, a transistor's V_BE likewise, and a MOSFET's threshold voltage and gain
fall as it warms. Resistors change by their **temperature coefficient** (property, in ppm/K:
metal film about 50, carbon film about −500).

To see a circuit over a temperature range, choose **circuit temperature (°C)** as the stepped
property of a parameter sweep, for example −20 27 85. It can be combined with part properties.
The op-amp, regulator and 555 models keep their 27 °C behaviour: their temperature drift is
not modelled.

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

## Motion on the schematic

After a simulation, motors and servos show what they do:

- A **motor's rotor** (the marks inside its circle) turns at a rate proportional to the torque
  it produces: the largest torque of the run turns it at two revolutions per second, no torque
  leaves it still, and a braking (negative) torque turns it the other way. The arc around the
  motor shows the same torque as a share of the run's largest, and the text next to it gives
  the torque and the speed in rpm. Induction motors show their torque averaged over one supply
  period (a single-phase motor's torque pulsates at twice the supply frequency); set their
  **Poles** property for the right synchronous speed (4 poles at 50 Hz: 1500 rpm).
- A **servo's horn** points at its simulated angle (straight up is the centre, 0°).

**Playback** (Simulation tab, after a transient): **▶ Play** replays the run on the schematic in
8 seconds, and the slider shows any moment of it. LEDs, motors and servos follow the time
shown, so you can watch a motor start up or a servo turn. With reduced motion set in the
operating system, the rotors stay still and the arc shows the torque.

## Probes and the waveform viewer

- **V** then click a wire or pin: the voltage of that net against ground. Drag from one net to
  another for the voltage between them.
- **I** then click a part pin: the current into the part at that pin. A source delivering
  power therefore shows a negative current at its + pin, as in SPICE.
- Without probes, the viewer shows the nets that have a name (labels and rails).

In the viewer: drag to zoom, the wheel zooms, **Zoom to fit** resets. Click to set cursor A,
Shift+click for cursor B; the table shows the values at both cursors, their difference, and the
minimum, maximum, average, RMS, peak-to-peak and frequency over the visible range.

The **Pulse** button above a transient plot adds the pulse measurements of the visible range,
as an oscilloscope makes them: the base and top levels (the waveform's flat parts, or its
minimum and maximum when it has none), the 10–90 % rise time and 90–10 % fall time, the period
and the duty cycle (time above 50 % per period), and the overshoot above the top and undershoot
below the base in % of top − base. Edge times and cycles are averaged over the complete ones in
view; zoom to one edge to measure only that edge. An edge can only be as short as the
simulation's time steps around it.

The **FFT** button above a transient plot shows the spectrum of the visible range (zoom in on
the settled part first): Hann window, amplitudes as peak values in dBV or dBA, and per trace
the strongest component with its total harmonic distortion (harmonics 2 to 10).

Accuracy, checked against exact values, NumPy and ngspice's FFT on every build:
- amplitudes within 0.01 dB, also for a tone between two frequency bins (the window's main lobe
  is measured, not one bin), and frequencies to a fraction of a bin;
- harmonic levels of a clipped sine within 0.1 dB of ngspice;
- a tone 40 dB below another measured to 0.01 dB; leakage floor about −120 dB;
- no aliasing: the FFT is as long as the waveform's points in view need (up to about a million).

The resolution is 1 / (the time in view): show more periods for finer frequency steps. With
only a few periods in view, a tone that is not a whole number of periods shows a small false
distortion (about 0.06 % THD for 10.5 periods). The waveform itself is only as fine as the
simulation's time step: for harmonics up to a frequency f, use a time step below 1 / (20 f).

## Models and accuracy

The simulator is a SPICE-style engine built into NETApps (modified nodal analysis, the
SPICE diode, bipolar and level-1 MOSFET equations). It is checked against ngspice on a
reference suite of circuits on every build: results agree within 1 % or 1 mV / 1 µA (SIM-04).
The time step of a transient follows the integration error of every capacitor and inductor, as
in SPICE.

- Diodes, LEDs and Zener diodes: SPICE diode model; LEDs from their forward voltage at 20 mA.
  Rectifier diodes and bridges include their junction capacitance (constant, datasheet value).
- **SPICE models:** diodes, Zeners, transistors and MOSFETs take a pasted `.model` line from a
  datasheet (property "SPICE model"). The parameters the simulator models are used, including
  the temperature parameters XTI and EG; the others (junction capacitances) are listed as
  ignored. Level-1 MOSFET models only.
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
- TVS diodes: breakdown at the nominal breakdown voltage and the datasheet clamping voltage at
  the peak pulse current; bidirectional types clamp both ways. The stress check compares the
  peak power with the 400 W pulse rating and the average with 1 W.
- IGBTs: the classic equivalent circuit (a MOSFET driving a PNP), fitted to the gate threshold
  and VCE(sat); models with a diode include the anti-parallel diode. No gate charge, tail
  current or switching losses.
- Optocoupler: an infrared LED and a phototransistor; the collector current is the current
  transfer ratio (property, %) times the LED current until the transistor saturates.
- TL431 shunt reference: holds REF at 2.495 V above the anode (TLV431: 1.24 V) by sinking
  cathode current; it conducts like a diode in reverse. The minimum cathode current is not
  modelled.
- NTC thermistor: follows the circuit temperature with its B value; no self-heating. Fuse: its
  cold resistance; the stress check says when the RMS current would blow it.
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
