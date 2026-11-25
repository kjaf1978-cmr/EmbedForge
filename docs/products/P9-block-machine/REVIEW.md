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

Verified after the fixes: `tests/blockmachine.test.ts`, 16 of 16 (the result in the package's
`7-simulation-tests/`), and the firmware's host tests, 19 tests and 487 checks.
