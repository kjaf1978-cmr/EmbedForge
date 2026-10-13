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

## Probes and the waveform viewer

- **V** then click a wire or pin: the voltage of that net against ground. Drag from one net to
  another for the voltage between them.
- **I** then click a part pin: the current into the part at that pin. A source delivering
  power therefore shows a negative current at its + pin, as in SPICE.
- Without probes, the viewer shows the nets that have a name (labels and rails).

In the viewer: drag to zoom, the wheel zooms, **Zoom to fit** resets. Click to set cursor A,
Shift+click for cursor B; the table shows the values at both cursors, their difference, and the
minimum, maximum, average, RMS, peak-to-peak and frequency over the visible range.

## Models and accuracy

The simulator is a SPICE-style engine built into NETApps (modified nodal analysis, the
SPICE diode, bipolar and level-1 MOSFET equations). It is checked against ngspice on a
reference suite of circuits on every build: results agree within 1 % or 1 mV / 1 µA (SIM-04).

- Diodes, LEDs and Zener diodes: SPICE diode model; LEDs from their forward voltage at 20 mA.
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
- A power rail with no source on it is driven by an ideal supply at the voltage in its name
  (+5V → 5 V); the Simulation tab says so.

**Export → SPICE netlist** writes the same circuit for ngspice or LTspice.
