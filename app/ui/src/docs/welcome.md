# Welcome to NETApps Electric Simulation

NETApps Electric Simulation (NETApps for short) is an offline electronics design and simulation tool. Everything runs on this computer; no
internet connection or account is needed.

## What you can do in this version (Increment 2)

- **Draw schematics** with a library of generic parts: resistors, NTC thermistors, fuses,
  capacitors, inductors, potentiometers, single- and three-phase transformers, sources
  (including a three-phase supply), diodes (also Schottky), TVS diodes, bridge rectifiers, LEDs,
  Zener diodes, transistors, MOSFETs, IGBTs, optocouplers, op-amps, regulators (also low-dropout),
  the TL431 shunt reference, the 555, switches, push-buttons, relays, motors (DC, single- and
  three-phase AC, hobby servo), and logic gates with a D flip-flop. Diodes and transistors also take SPICE models from datasheets.
- **Simulate** them: operating point, transient, AC sweep and DC sweep, with voltage and current
  probes and a waveform viewer. Switches, buttons and potentiometers work while you simulate.
- **Check** them: the electrical rule check marks problems as you draw.
- **Sweep** up to three part values or the temperature (parameter sweep), simulate at any
  **temperature**, run a **tolerance analysis** (Monte Carlo), check every part against its
  ratings (**stress check**), look at the **spectrum** (FFT) of a waveform, measure rise and
  fall times, duty cycle and overshoot (**pulse measurements**), and get the **parts list**
  (bill of materials).
- **Save** projects with version history, and **export** SVG, PNG, SPICE netlists, waveforms
  and the parts list as CSV.

## First steps

1. On the **Start** screen, open the **tutorial** (five minutes), or an **example**.
2. Press **F5** to simulate. Change a value and watch the result change.
3. Press **F1** in any view for its help page, and **Ctrl+Shift+P** for the list of every
   command.

## Coming next

- **Increment 3:** PCB layout and routing.
- **Then:** boards and flashing, the natural-language design assistant, the parts catalogue,
  firmware emulation.

The **Traceability** view shows the planned link between requirements, code and circuit on a
sample project; it becomes live with the design assistant.
