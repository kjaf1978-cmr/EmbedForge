# P9 block moulding machine: independent review and resolutions

Review of 23 November 2026, by an independent reviewer who had the circuit
(`app/ui/src/eda/blockMachine.ts`), its tests and models, the firmware (`firmware/block-machine/`),
the earlier design notes, DFMEA, parts list and wiring list, and the project's checklist, but not
the designer's conclusions. 3 blockers, 8 major and 3 minor findings, all resolved. The owner decided the
three architectural questions (D65, D66, D67, 25 November 2026). Designators: those of the
schematic after the fixes.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | Every coil and valve was switched on its 0 V side and the 0 V was not earthed: with the usual 0 V–PE bond, a valve's chafed "−" wire on the frame switched the valve on (EN 60204-1 9.4.3.1) | D66: the 0 V bonded to PE at one point (X3); every output switched on its +24 V side (IRF9540N, 2 A current limit, read-back). A wire to the frame is now a limited short, read back and switched off. Test: "valve 1's wire shorted to the frame" |
| 2 | Blocker | The manual reset failed under single faults: a welded reset relay (K3, fed permanently from the 24 V) or RESET jammed at power-up restarted the machine (the reviewer simulated it); the reset acted on the press; a cross short between the channels went unseen; the BM-6 mitigation could not be implemented (RESET was not wired to the controller) | D65: two certified safety relays (E-stop K1, guards K4) with a monitored start on the release; their test pulses find cross shorts; K3 and its capacitor removed. Tests: RESET held through an E-stop, RESET jammed at power-up with a 100 ms supply rise, one channel only, a channel bridged |
| 3 | Blocker | The hydraulics at an E-stop were unspecified: with an open centre or spool leakage the tamper and the raised mould fall; no manual release | INSTALLATION section 3: tandem-centre valves, pilot-operated check or counterbalance valves on the tamper and the mould, relief valve, manual lowering, no accumulator; DFMEA BM-14; COMMISSIONING 5.1 … 5.4; TT-9 |
| 4 | Major | A shorted output switch (or a stray strand) energised its load the instant the rail returned; nothing was read back; no free pins | D66, D67: a common enable (IRF4905, Q7) between the rail and the outputs, given only with every output off; each output read back (A0 … A7); an output on while commanded off drops the enable within 3 ms, before a contactor or valve pulls in. Tests: "valve 1's MOSFET shorted" (circuit), "an output stuck on when the rail comes on" (firmware) |
| 5 | Major | Adjacent-pin and cross-short faults: V24F and V24S on neighbouring connector pins (one strand bypassed both safety contactors); E1L–E2L shorts undetected; no PL calculation | The safety relays' test pulses detect channel shorts; the rail and the 24 V are on separate terminals with the new board's layout (the connector pairs to be kept apart: board layout); a PL estimate in INSTALLATION section 4 (PL d, the electrical part), the verification with the parts as built is TT-2 |
| 6 | Major | The guards were not designed: in series with the E-stop (fault masking), no switch type, no run-down | The guards on their own safety relay K4 with coded interlocks (EN ISO 14119); the run-down measured (COMMISSIONING 5.6), guard locking where it exceeds the access time (INSTALLATION section 2); the coil suppressors are now TVS (fast drop-out) |
| 7 | Major | No sensor plausibility: a shorted "tamper up" opto could start the feeder under a lowered tamper | A cylinder's two end sensors both on, or the end a move starts from still seen 1 s after the move began, is a FAULT (sensor); the interlocks on the sensors (the feeder only with the tamper up, the tamper down only with the feeder home) fault when a sensor changes against them; every step has a time limit. Host test: "sensor plausibility" |
| 8 | Major | Pressure was a 2 s timer; the pump started and idled against the relief valve; no pressure, oil temperature or breaker inputs | Tandem-centre valves (the pump unloads); the pressure switch ends PRESS; the oil temperature switch and the breakers' auxiliary contacts are FAULT inputs (D67) |
| 9 | Major | 400 V gaps: no PE, no specified 24 V supply, the main switch inside the door, no short-circuit rating, the GV2 and 3RT2 not coordinated | INSTALLATION section 1: PE bar and bonding, a 400 V-input 24 V supply, the main switch worked from outside (door-coupled handle), the 6 kA rating on the nameplate; the motor breakers changed to Siemens 3RV2 (type-2 coordinated with the 3RT2); the pump contactor described as the 3RT2026 it is (25 A) |
| 10 | Minor | F1 also protected the thin field wiring; a current-limited supply might not clear it; the DC breaking of one contactor pole | F2 (2 A) for the field 24 V; two poles of each safety contactor in series |
| 11 | Minor | STOP depends on its PC817 | Stated in the DFMEA (BM-11): an operational stop, single channel by design; the E-stop is the safety stop |
| 12 | Minor | The lamp's description against the firmware; the bootloader flashing D13 | The lamp on D10 (the Mega); a fault is kept and shown while the rail is off; the description corrected |
| 13 | Major | The package was incomplete for a builder | User manual, installation guide (panel, earthing, hydraulics, guards, PL), assembly guide, commissioning procedure with stop-time measurement and record, type tests, DFMEA BM-1 … BM-16 |

Found while fixing: the netlist builder accepted a part key twice and silently gave the second
part the first one's probes and designator lookup (the bench's valve coil and a sense resistor
here; also in P3, P4b and the inverters, where no test or document used the keys concerned). It
now refuses a reused key, and a test checks every design.

Verified after the first review's fixes: `tests/blockmachine.test.ts`, 16 of 16 (the result in the package's
`7-simulation-tests/`), and the firmware's host tests, 19 tests and 487 checks.

## Second review (25 November 2026), of revision B

By a second independent reviewer, with the redesign, its simulator model of the safety relays,
the firmware, the routed board and the documents. 3 blockers, 6 major and 3 minor findings, all
resolved. Designators: those of revision C.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | STOP turned the outputs' enable on without checking the outputs, and cleared a fault on its level: with an output's switch shorted, pressing STOP (or a broken STOP cable) fed the load | While STOP is held the enable stays off (its own read-back still checked); a fault is cleared only on STOP's release, and the enable is then tried with every output checked. Host tests: STOP held with an output stuck; the random test now also injects stuck outputs and checks that no load is fed long enough to act |
| 2 | Blocker | The panel connector put the safety rail next to the field 24 V and an output next to the raw 24 V: one strand bypassed both safety contactors | The four 24 V supplies (raw, fused, field, rail) leave the board on their own terminal block, J_SUPPLY, an empty pole between each (a new layout rule, `separate`); no output is next to a supply |
| 3 | Blocker | The enable MOSFET (IRF4905, TO-220) was on a TO-92 footprint with the wrong pinout: the library's default for a MOSFET it did not list | Its TO-220 G-D-S entry added; a MOSFET or a transistor missing from the library is now an error, not a silent TO-92 (every part of every design has its entry) |
| 4 | Major | The safety relay model started when a RESET held from power-up was released; the test claiming otherwise never released it | The model has the unit's power-on delay: a start loop closed from power-up must be seen open before a press counts. The test releases RESET inside its window and then shows that a later press does start; the bridged-channel test is named for what it is (a short between the channels is the unit's certified test-pulse function, not modelled) |
| 5 | Major | The pump contactor's catalogue part had no auxiliary contact, but its mirror NC is in the start loop | The pump contactor K6 with a 3RH2911 auxiliary block (mirror contact) |
| 6 | Major | PL d claimed for the feeder and the vibrators, each on one contactor: a weld kept the motor running after an E-stop | K5, a second contactor in their common 400 V feed, its coil on the safety rail and its mirror contact in the start loop: two contactors in series for every hazardous motor |
| 7 | Major | The safety relays' terminals, settings and contact fusing were not specified | INSTALLATION: the settings (two channels with cross-circuit detection, monitored manual start), the terminals from the unit's data sheet (the schematic's names are generic), recorded at commissioning (1.7); F3 (1 A) in their enabling circuits |
| 8 | Major | A partial short held an output in its current limit while reading "on": its MOSFET overheated | The read-back in volts: an output more than 1.2 V below the outputs' supply 5 ms after it was switched on is a FAULT. Host test: a partial short. The sense resistors 2 W |
| 9 | Major | Commissioning 4.9 bridged an output to the raw 24 V (the tamper could move); 4.6 was unclear | 4.9: the valve's plug off, a clip lead across its MOSFET; 4.6: a wire of each contactor's mirror contact lifted in turn |
| 10 | Minor | Parts list and wiring list: the pump breaker's range; the wire column empty; the 5 × 20 fuse holders ordered for TR5 footprints | The breaker 3RV2021-4AA10 is 11 … 16 A (corrected); the wiring list gives each wire's size and colour. The fuse holders: a fault of the catalogue that affected several boards, signed-off ones too; the owner decided (D69): TR5 fuses up to 6.3 A in the parts lists, the boards unchanged |
| 11 | Minor | "3 ms" was 2 … 4 ms of millis() ticks plus a loop | Stated as within 5 ms, the pull-in of a contactor or valve being 15 … 40 ms |
| 12 | Minor | The Mega's fit: a hex stand-off at the hole next to SCL touches the header; a USB plug's moulding hit the carrier; 5 V back-feed into a computer | A round nylon spacer there; the Mega placed so its jacks stand 2.3 mm past the board's edge; unplug the 24 V (or use a cable without 5 V) for an update |

Verified after the second review's fixes (revision C): `tests/blockmachine.test.ts`, 16 of 16
(the result in the package's `7-simulation-tests/`), the firmware's host tests, 21 tests and 504
checks, and the board: DRC 0, 170 parts, matching the schematic.
