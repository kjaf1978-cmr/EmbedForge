# Block moulding machine (P9): commissioning procedure

Done by the machine builder's electrician before the machine is put into service, after any
change to the panel, the safety circuit or the hydraulics, and every 6 months for section 4 and
5.6. Record every result at the end. The designators are those of the schematic.

You need: an installation tester (insulation, earth continuity, loop impedance), a multimeter, a
stopwatch or a stop-time meter, and the hydraulic unit's gauge.

## 1. Before power

| Step | Check | Expected |
|---|---|---|
| 1.1 | The wiring against `panel.csv` and INSTALLATION.md; every terminal tight | — |
| 1.2 | PE continuity: every motor, the door, the plate, the frame, the hydraulic unit to the PE bar | ≤ 0.1 Ω each (EN 60204-1 18.2) |
| 1.3 | Insulation of the 400 V circuits to PE (500 V DC, the 24 V side disconnected at X1) | ≥ 1 MΩ |
| 1.4 | The 0 V–PE bond: X3 to the PE bar, and nowhere else (lift X3: 0 V to PE open) | one bond |
| 1.5 | The motor breakers set: Q34 to the pump's, Q35 to the mixer's, Q36, Q37 to the vibrators' nameplate current | the settings recorded |
| 1.6 | The hydraulics to INSTALLATION section 3: tandem-centre valves, the load-holding valves on the tamper and the mould, the relief valve, the manual lowering; the oil level | — |
| 1.7 | **The safety relays' settings** (K1, K4): two-channel input with cross-circuit detection, monitored manual start; their terminal use as the data sheet; recorded | as INSTALLATION section 1 |

## 2. Power and the 24 V

| Step | Action | Expected |
|---|---|---|
| 2.1 | Main switch on | nothing moves; the green lamp (D3) off; the door lamp off |
| 2.2 | 24 V at X1–X2; 5 V at the Mega | 23.5 … 24.5 V; 4.8 … 5.2 V |
| 2.3 | Loop impedance at the motors' terminals (each breaker's magnetic trip at 13 × its setting) | below 230 V / (13 × setting) |

## 3. The inputs and the outputs (the machine's motion uncoupled where possible)

| Step | Action | Expected |
|---|---|---|
| 3.1 | Press RESET and release it | the green lamp on (the safety rail) |
| 3.2 | Each sensor in turn: bring its target | its input's PC817 conducts (the sensor's LED on); the Mega reads it (a serial monitor, or the sequence below) |
| 3.3 | Each motor's direction: START (homing) with the hydraulics' pressure line closed at first | the pump's direction by its arrow; the mixer and the vibrators the right way |
| 3.4 | Homing: START with the tamper half-way, the feeder out, the mould up | the tamper up first, then the feeder home, then the mould down onto the pallet; READY |
| 3.5 | One cycle without concrete: START | each step as USER_MANUAL section 2; the pressure switch closes when the tamper presses |
| 3.6 | Unplug valve 1's plug while READY; press START | FAULT when the tamper does not come down in time |

## 4. The safety functions

| Step | Action | Expected |
|---|---|---|
| 4.1 | **Each E-stop**, while a cycle runs | everything stops; the green lamp off |
| 4.2 | Release it | nothing restarts; only RESET (on its release) switches the control on; nothing moves until START |
| 4.3 | **Each guard**, opened while a cycle runs | the same as 4.1 and 4.2 |
| 4.4 | RESET held down, then an E-stop pressed and released | no restart while RESET is held, nor when it is released afterwards |
| 4.5 | Power cut (main switch off and on) while running | nothing restarts; RESET needed |
| 4.6 | **The contactors' feedback:** with the main switch off, lift one wire of the pump contactor K6's mirror contact (21 or 22: it then reads as a welded contact), switch on and press RESET; refit it. Repeat for K5, K7, K8, K9, K2 and K3 | RESET does not switch the control on while a wire is lifted; it does once refitted |
| 4.7 | **One E-stop channel:** lift one wire of channel 1 (X4) while running, then refit it | the machine stops; RESET does not restart it until both channels have opened (press and release the E-stop) |
| 4.8 | **A cross short:** bridge X5 to X8 (channel 1 to channel 2) | the safety relay K1 goes to its fault state (its LED) and the control stays off. Remove the bridge |
| 4.9 | **An output stuck on:** main switch off; valve 1's plug off its valve (nothing can move), and a clip lead across its high-side MOSFET Q21's drain and source (pads 2 and 3) on the board; switch on, press RESET | FAULT within 5 ms of the outputs' enable, the lamp flashing fast; the enable off. Main switch off, remove the clip lead, refit the plug |
| 4.10 | **A short to the frame:** while valve 1 is on in a cycle, short X24 to PE | FAULT within a few milliseconds; the output off |

## 5. Stopping, hydraulics and run-down

| Step | Action | Expected |
|---|---|---|
| 5.1 | E-stop while the tamper comes down | it stops; it stays where it stopped for 10 min (the load-holding valve) |
| 5.2 | E-stop with the mould up | the mould stays up for 10 min |
| 5.3 | The relief valve's setting on the gauge | the working pressure + 10 % |
| 5.4 | The manual lowering | the tamper and the mould can be moved by hand with the machine off |
| 5.5 | The pressure switch's setting | closes at about 80 % of the relief setting |
| 5.6 | **The stopping time:** E-stop with the vibrators and the mixer running; time until each is still | recorded. If longer than reaching into the mould area through the opened guard takes (EN ISO 13855), guard locking is required (INSTALLATION section 2) |

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| PE continuity (worst) | ≤ 0.1 Ω | | |
| Insulation 400 V to PE | ≥ 1 MΩ | | |
| 0 V–PE bond at X3 only | yes | | |
| Breaker settings Q34, Q35, Q36, Q37 | the nameplates | ___ / ___ / ___ / ___ A | |
| 24 V, 5 V | 23.5 … 24.5 V, 4.8 … 5.2 V | | |
| Every sensor read | yes | | |
| Homing and one cycle | as the manual | | |
| E-stops (each), guards (each): stop, no restart without RESET | yes | | |
| RESET held, power cut: no restart | yes | | |
| A contactor's feedback open: no reset | yes | | |
| One channel opened: no restart until both opened | yes | | |
| Cross short: the relay faults | yes | | |
| Output stuck on, short to the frame: FAULT | yes | | |
| Tamper and mould held 10 min after an E-stop | yes | | |
| Relief valve, pressure switch | ___ bar, ___ bar | | |
| Manual lowering works | yes | | |
| Stopping time of the vibrators, the mixer | ___ s, ___ s | | |

Date, machine and serial number, name and signature:
