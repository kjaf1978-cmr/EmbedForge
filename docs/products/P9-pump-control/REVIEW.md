# P9 pump controller: independent review and resolutions

Review of 17 November 2026, by an independent reviewer who had the circuit
(`app/ui/src/eda/pumpControl.ts`), its tests, its models, the routed board and these documents,
but not the designer's conclusions. 2 blockers, 7 major and 4 minor findings (several minor points
grouped). Designators: those of the schematic.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | The control's 0 V on PE (PELV): earthed metal in the water (a metal tank, a steel casing, a galvanised rising main) shorts every rod to the 0 V: the tank reads dry, the pump runs into an overflow; DC returns through the water | The control is **SELV**, not earthed: the measurement is between each rod and its COM rod only. The PE stud carries only the protective conductors. DFMEA PC-9; commissioning 1.5 (control to PE insulation); TT-2 in an earthed metal tank |
| 2 | Blocker | The documents used the design's internal keys, not the designators of the schematic, the parts list and the wiring list (a pump wire could have gone to an electrode terminal) | Every document uses the schematic's designators. The same defect was found and corrected in P4b's documents |
| 3 | Major | Single faults blind both channels: the tank's COM disconnected; the OVERFLOW sensing chain shared by the control and the protection | The protection has its own sensing chains (OVERFLOW, DRY) and checks each COM rod through a second core (the excitation read back): no COM, no pump. Test: "the tank's COM rod disconnected" |
| 4 | Major | The maximum-run counter reset by the wrong signal: it counted while the pump waited, a latched FAULT could not be reset, its power-up state was random | Cleared whenever RUN is off and at power-up (a spare gate and two diodes) |
| 5 | Major | Long cables: a rod in air read wet through the cable's capacitance (about 6 nF at 200 Hz) | 100 Hz excitation, 22k and 100 nF (a low-pass: the square wave's edges coupled through the cable and were peak-detected, found in simulation) from each sensing input to 0 V, threshold 1.2 V. Test: "long electrode cables (10 nF)"; TT-5 sets the length; the wet threshold is now about 15 kΩ (TT-1) |
| 6 | Major | No hysteresis; the protection's relay does not latch | Hysteresis (10 M) on every comparator. The protection is deliberately not latched: it acts only on overflow, dry or a lost COM rod and releases when the cause has gone; the control's FAULT latch (overflow) holds K6 off, so in normal operation the pump stays off after an overflow. With two faults (K6 or K7 stuck and HIGH broken) the pump cycles slowly at OVERFLOW (the hysteresis and the peak detectors' time) without overflowing (test) |
| 7 | Major | A welded contactor cannot be stopped | A second contactor K5, worked only by the protection's relay K8, in series with the pump contactor K7. Test: "K7 welded and the HIGH cable broken" |
| 8 | Major | Switchgear too small for 1.5 kW (10 … 11 A); the GV2ME wired on two poles | Q1 GV2ME16 (9 … 14 A), wired for single phase as the maker shows; both contactors 18 A AC-3 |
| 9 | Major | The transformer (2 VA) overloaded | 4.5 VA (Block VB 4,5/1/15, IEC 61558-2-6) |
| 10 | Minor | PERMIT's gating did not stop the driver (its diode left the base at 1.3 V) | PERMIT and RUN drive two transistors in series |
| 11 | Minor | Commissioning bridged K6's mains terminals | A TEST button (SW1) on the SELV side forces K6; it cannot be left bridged; a final cycle with nothing forced (4.10) |
| 12 | Minor | Borehole cable separation; no clamp on the COM lines | The borehole electrode cable rated for the mains voltage (INSTALLATION section 2); SMAJ12CA on each COM line |
| 13 | Minor | Short dips, FAULT LED loading, Q1's state, a broken DRY cable, the board feed's protection, nominal times | Documented (short dips, Q1's handle, a broken DRY cable keeps the yellow LED on); the FAULT LED at 4.7k; the board fed behind the gG fuse F2; the times stated as about 8 s, 8 min, 2.2 h (± 20 %) |

Verified by simulation after the fixes: `tests/pumpcontrol.test.ts` with LONG=1 (the result in
the package's `7-simulation-tests/`).
