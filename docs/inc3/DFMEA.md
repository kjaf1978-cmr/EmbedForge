# DFMEA of the power designs (decisions D22, D23)

Design failure mode and effects analysis of the worked examples of the power track:
change-over 1P (`changeover-1p`), change-over 3P+N (`changeover-3p`), mains voltage stabiliser
(`stabiliser`), MPPT solar charger (`mppt-charger`) and the inverters (P7, D30): section 5 the
50 Hz transformer type; the high-frequency type follows.

## 1. Method

- **Standard:** AIAG-VDA FMEA handbook (2019). Ratings 1 to 10 for severity (S), occurrence
  (O) and detection (D); the action priority (AP: H high, M medium, L low) follows the
  handbook's tables. Ratings are given **after** the design action. Where an action is still
  open it is listed under "Open" with its AP before the action.
- **Detection** rates how well the *design verification* finds the failure before release.
  A simulation test that injects the fault rates D = 2; an analysis (worst case, life
  calculation) D = 3–4; a review only D = 6–7.
- **Use profile** (the "worst foreseeable use", D23): installation in a hot humid tropical
  climate, air around the product up to 45 °C (50 °C peak), PV cells up to 65 °C, relative
  humidity up to 95 % with condensation, salt mist near coasts, insects; a weak grid with
  frequent outages, brown-outs, surges and lightning (up to 150 flashes/km²/year); generator
  back-up with poor regulation; unskilled installation (reversed polarity, loose terminals,
  wrong connection order); 24 h operation. Root causes come from
  [FIELD_FAILURES.md](FIELD_FAILURES.md) (rows FF-01 … FF-52).
- **Design rules** applied to every design (they answer FF-08, FF-24, FF-25, FF-39 … FF-46):
  - semiconductors: junction ≤ 125 °C at 45 °C air (≤ 72 % of a 175 °C rating), voltage ≤
    80 % of the rating in normal operation;
  - capacitors: film or ceramic wherever the value allows; electrolytics only 105 °C long-life
    types, with their life calculated (RELIABILITY.md);
  - resistors: metal film; no single resistor above 1 MΩ in a measuring path (board leakage in
    humid air), no carbon trimmers (all values fixed, E96);
  - thresholds from a band-gap reference (TL431), never from a supply rail;
  - every protection fail-safe: a broken sensor, an open wire or a missing supply leaves the
    output off;
  - board: conformal coating (IPC-CC-830), creepage for pollution degree 3, clean after
    soldering (ionic contamination); enclosure IP54 with a membrane vent, cable glands from
    below, insect mesh ≤ 1 mm, no bare live parts inside (PFMEA.md, recommendations).

Verification references are test names in `app/ui/tests/` (file: test).

## 2. Change-over, single-phase and 3P+N

Function: connect the load to the mains while it is healthy (195 … 253 V on every phase, no
phase more than about 10 % below the highest), otherwise to the back-up source; never both.

| # | Failure mode | Effect | Cause | Design action (implemented) | S | O | D | AP | Verified by |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | Both contactors closed | Back-up source fed into the mains (danger to line workers), short between sources | Contactor welded or slow; logic fault | NC auxiliary contact of each contactor in the other's coil circuit (mechanical/electrical interlock); dead time 0.47 s between one opening and the other closing | 10 | 2 | 2 | L | power.test: "never both contactors closed" (every case), "dead time" |
| C-2 | Load stays on an overvoltage | Appliances destroyed (lost neutral, generator AVR fault) | Threshold drift; no trip | Window comparator per phase against a TL431; trip ≥ 253 V within 10 ms + contactor drop-out | 9 | 2 | 2 | L | power.test: 254 V trips, 252 V holds; power3step: 256 V on L1 |
| C-3 | Load stays on an undervoltage | Motors and compressors stall and overheat | as C-2 | trip ≤ 195 V; 3P: every phase | 8 | 2 | 2 | L | power.test: 194 V trips; power3step: 190 V on L1 |
| C-4 | Lost phase not detected (3P) | Three-phase motors single-phasing, burn out | Regenerated voltage of running motors on the lost phase | Asymmetry trip: a phase more than ~10 % below the highest (diode OR of the phases) | 8 | 3 | 2 | L | power3: loss of L3, 12 % below; 7 % holds |
| C-5 | Chatter at a threshold | Contact wear, flicker, load stress | Ripple and noise around a threshold | Hysteresis after a trip (reconnect only within 205 … 245 V), 10 ms filter on the OK line | 6 | 2 | 2 | L | power.test: stepping 180 → 200 V stays on back-up, → 210 V returns |
| C-6 | Restart storm, hunting on a flickering mains | Compressors stall, contactors wear | Immediate return after an outage | Return delay 10.5 s (10 µF film, 2 × 750k) before the mains is taken back | 6 | 2 | 3 | L | dead-time test (scaled timing); timing calculation in the notes |
| C-7 | Contactor chatter in a brown-out | Coil burn-out, welded contacts | Coil supply between drop-out and pick-up | Coil-supply undervoltage lockout: both contactors open below 20 V | 7 | 2 | 2 | L | power.test: "coil supply at 18 V" |
| C-8 | Surge destroys the sense and control | Unit dead, possibly stuck on one source | Lightning, switching surges (FF-34, FF-38) | 300 V AC varistors on every phase of both sources (type 3); the installation's type 2 SPD in front (installation guide) | 7 | 4 | 4 | M | review; surge parts rated (stress check) |
| C-9 | Varistor ageing / thermal runaway | Fire, loss of protection | Many surges, TOV of a lost neutral (FF-34, FF-35) | 14 mm discs (6 kA), Uc 300 V AC; thermally protected type (SPD-T3) in the product; replaced at service when the indicator shows | 8 | 3 | 5 | M | wear-out life in RELIABILITY.md; **open:** thermal fuse not modelled |
| C-10 | Contacts welded by inrush | Cannot transfer (C-1 guarded by interlock) | Capacitive/motor inrush (FF-01) | 32 A AC-3 contactors for a ≤ 6 A load (5 × margin) | 7 | 2 | 4 | L | stress check (RMS current ≤ rating) |
| C-11 | Coil drive transistor shorted | Contactor permanently on | MOSFET failure | IRLZ44N at 5 % of its current rating, gate clamped; the interlock still prevents both sources | 7 | 2 | 3 | L | stress check; reliability prediction |
| C-12 | Threshold drift | Nuisance trips or no trip | Humidity leakage, tempco (FF-08) | E96 metal film, ≤ 750 k per resistor, TL431 reference, coating | 7 | 2 | 3 | L | thresholds tested at ± 1 V; temperature analysis available |
| C-13 | Diagnosis impossible | Long outages, wrong repairs | No indication | LEDs: ON MAINS, ON BACK-UP, OVERVOLTAGE, UNDERVOLTAGE; FAQ in the help | 4 | 3 | 3 | L | review |
| C-14 | Terminal overheating | Fire | Loose screws, Al/Cu, thermal cycling (FF-10) | Box-clamp terminals for Cu and Al, torque on the label, no load current through the PCB | 9 | 3 | 6 | **H→M** | **open (mechanical design):** temperature-rise test at 1.1 × rated current |
| C-15 | Insects or condensation short the board | Wrong operation, fire | FF-41, FF-44 | IP54, membrane vent, mesh, coating, no bare live parts | 8 | 3 | 6 | M | **open (enclosure):** damp heat cyclic test IEC 60068-2-30 |

## 3. Mains voltage stabiliser (relay taps, 1 kVA)

Function: keep the load within 230 V ± 10 % for 140 … 300 V input; never put it outside that
range.

| # | Failure mode | Effect | Cause | Design action (implemented) | S | O | D | AP | Verified by |
|---|---|---|---|---|---|---|---|---|---|
| S-1 | Output overvoltage to the load | Appliances destroyed | A tap relay welded or stuck on; control failure (FF-13) | **Independent** output protection: own sense transformer, TL431 and comparators; output relay opens outside 190 … 255 V and the restart delay starts again | 9 | 2 | 2 | L | stabiliser.test: "fault: tap relay K1 stuck on" |
| S-2 | Two taps connected together | Shorted turns, fire, relays welded (FF-11) | Overlapping relay contacts | Relay chain: each relay's NC feeds the next, so only one path to the input exists at any time | 9 | 1 | 2 | L | inherent (topology); every tap test |
| S-3 | Relay contact erosion → end of life | Stuck tap or open output (the main field failure of stabilisers) | Arcing when a contact breaks the winding current (FF-03) | 30 A relays (AgSnO2) for a 4.5 A load (electrical life > 4 million operations); RC contact protection (100 Ω + 100 nF X2) across each contact | 7 | 3 | 3 | L | RELIABILITY.md: 60 years at 200 changes a day |
| S-4 | Tap hunting | Flicker, relay wear (FF-12) | No hysteresis | 1 MΩ feedback: about 3 V hysteresis per step | 5 | 2 | 2 | L | stabiliser.test: ± 6 V around each step |
| S-5 | Load connected during start-up | 346 V on the load for 0.2 s (found in simulation) | Sense filter empty: all relays on, lowest tap | Output relay after a restart delay (about 8 s: 1 MΩ, 4.7 µF film, against 80 % of the rail), and only while the 230 V tap is in range | 9 | 2 | 2 | L | stabiliser.test: "connected only after the power-on delay, never above 253 V" |
| S-6 | Restart storm after an outage | Compressors stall (FF-09) | Immediate restart | Restart delay about 8 s, restarted by every cut-off and by every supply interruption (DDIS empties the delay capacitor); refrigeration compressors without their own restart protection need a 3-minute delay relay of their own (in the installation guide) | 6 | 2 | 3 | L | as S-5 |
| S-7 | Transformer overheating | Burn-out, fire (FF-14) | Overload at maximum boost, hot ambient | 10 A C breaker at the input (1 kVA at 140 V draws 7 A); **open:** thermal cut-out in the winding (115 °C, in series with the relay supply) | 8 | 3 | 5 | M | stress check at 140 V |
| S-8 | Relay drive failure | Relay half on, contacts burn (FF-15) | Missing flyback diode, weak drive | 1N4148 on every coil; BD139 drivers at 5 % of rating with 2.6 mA base drive | 7 | 2 | 3 | L | ERC (flyback rule), stress check |
| S-9 | Surge damage | Unit dead | Lightning, switching | 300 V AC varistor at the input | 7 | 4 | 4 | M | review |
| S-10 | Undervoltage passed to the load | Motors stall | Input below 140 V, a relay stuck off | Output cut-off below 190 V (S-1 circuit) | 8 | 2 | 2 | L | stabiliser.test (140 V gives 215 V; the cut-off window) |
| S-11 | Diagnosis | — | — | An LED beside each relay coil (which tap), OUTPUT and FAULT LEDs | 4 | 3 | 3 | L | review |

## 4. MPPT solar charger (3.7 kW unit, 48 V LiFePO4)

Function: charge the battery from the array with maximum power, never above 56.6 V (3.54 V per
cell) and 80 A, only between 0 and 50 °C battery temperature; never harm the battery, the
array or the people around them.

| # | Failure mode | Effect | Cause | Design action (implemented) | S | O | D | AP | Verified by |
|---|---|---|---|---|---|---|---|---|---|
| M-1 | Battery overcharged | Battery damage, BMS trip, fire risk (FF-19) | Q1 shorted; control failure | Independent overvoltage latch (own TL431, 57.6 V = 3.6 V per cell, below the BMS cut-off; 10 ms filter; armed while charge current above about 6 A flows: below that the BMS is the back-up): opens QB2 (battery) and QPV (array) until the power is removed; FAULT LED | 10 | 2 | 2 | L | charger.faults: "Q1 shorted" |
| M-2 | Output overvoltage when the BMS cuts the battery off | Converter and loads damaged (FF-18) | Inductor energy, converter still running | Fast stop of the PWM above 58.9 V (own divider); 5 kW TVS (5KP64A) for the inductor energy | 8 | 4 | 2 | L | charger.faults: "the BMS opens the battery during charging" (peak below 100 V, the converter stops; the output capacitors then hold up to about 70 V until the battery returns) |
| M-3 | Reverse current into the converter | 200 A when the battery meets empty capacitors (found in simulation); battery drained into the array at night (FF-20, FF-26) | Body diode of Q1 | Ideal diode in the battery's negative lead (QB, its body diode blocks), gate driven against its own source | 9 | 2 | 2 | L | charger.test (every case: the battery connected at t = 0 with empty capacitors) |
| M-4 | QB turned on by the battery itself | 2 kA discharge into COUT (found in simulation) | Gate driven against GND while the battery's negative is 52 V below it | Gate drive referenced to the source: PNP + 47 k, 100 k gate–source, 12 V Zener | 9 | 1 | 2 | L | charger.test, stress check |
| M-5 | Array connected the wrong way round | Converter destroyed (FF-17) | Installer | QPV in the PV negative lead, self-biased from PV+ | 7 | 4 | 2 | L | charger.faults: "PV array connected the wrong way round" |
| M-6 | Battery connected the wrong way round | Converter destroyed, fire (FF-17) | Installer | QB2's gate is fed from the battery's own + terminal (470k, 12 V Zener to its source): a reversed battery can never turn it on, even while the array supplies the control (found when the control supply moved to the PV input, D28); its body diode blocks; 100 A battery fuse | 9 | 4 | 2 | L | charger.faults: "battery connected the wrong way round" |
| M-7 | Charging a battery below 0 °C or above 50 °C | Lithium plating, ageing, fire risk (FF-47) | No temperature limit | NTC at the battery, window 0 … 50 °C; an open or shorted sensor also stops the charging | 9 | 3 | 2 | L | charger.faults: battery at 55 °C, at −5 °C |
| M-8 | Power stage overheating | Device failure, fire (FF-24, FF-32, FF-46) | Hot climate, dust, high current | No fan; heatsink 1.5 K/W per device; Tj ≤ 125 °C at 65 °C air; NTC at the heatsink stops charging above 90 °C | 8 | 2 | 2 | L | charger.test: "hot case … Tj 125 °C"; charger.faults: heatsink at 95 °C |
| M-9 | Input overvoltage | Q1 avalanche (FF-16, FF-21) | Cold morning Voc, surges | 200 V MOSFET for 115 V Voc (58 %), 170 V DC varistor at the input, RC snubber; label "max Voc 120 V"; DC SPD at the array (installation) | 8 | 3 | 3 | L | stress check (Vds), review |
| M-10 | Capacitor dry-out | Ripple, instability, failure (FF-25) | Electrolytics in heat | **Film capacitors** for input (4 × 47 µF/250 V) and output (3 × 47 µF/100 V) | 7 | 1 | 3 | L | reliability: no wear-out item left |
| M-11 | Poor tracking on a hot roof | Up to half the energy lost (found in simulation: a fixed set point gives 44 % at 65 °C, 500 W/m²) | Vmp falls with temperature | Fractional open-circuit voltage MPPT: Voc sampled at power-on and every 10.4 s, PV held at 0.826 × Voc | 5 | 2 | 2 | L | charger.test: ≥ 97 % at 25 and 65 °C, 200 … 1000 W/m² |
| M-12 | Current overshoot / integrator wind-up | Inductor saturation, device stress (found in simulation: 121 A) | Duty-cycle soft start winding up the current loop | Average current-mode control, current limit in the reference itself, soft start of the reference | 7 | 2 | 2 | L | charger.test: peak inductor current < 110 A in every case; 80 A limit test |
| M-13 | Control supply missing or overloaded | Converter does not start; gate driver and bootstrap stress | A battery-fed supply cannot work (the battery is connected through QB2/QB, which need the supply); a short on the 12 V rail | 12 V from the PV input: MJE340 emitter follower from a 13 V Zener; its 22k base feed limits the output current inherently; 100 µF; the control runs whenever there is sun to convert | 5 | 2 | 3 | L | stress check; all charger tests run on this supply |
| M-14 | Low-current dead band | No current regulation below about 3.6 A | LM358 output floor (0.11 V) | Accepted: the MPPT loop limits through the reference; the body diode of QB carries currents below 6 A | 2 | 5 | 3 | L | analysis |
| M-15 | Diagnosis | — | — | LEDs CHARGING and FAULT; FAQ in the help | 4 | 3 | 3 | L | review |
| M-16 | PV connector arcing, ground fault | Fire on the PV side (FF-50, FF-51) | Installation | **Open (installation):** DC isolator and DC SPD at the array, same-brand connectors, ground-fault fuse; listed in the installation guide | 9 | 3 | 7 | **H** | open |

## 5. Inverter, 50 Hz transformer type (5 kW unit, 48 V LiFePO4) — in design

Function: 230 V ± 5 %, 50 Hz ± 1 %, sine with THD below 5 % from a 42 … 58.4 V battery, 5 kW
continuous and twice the rated current for motor starts; never harm the battery, the loads or
the people around them. Field root causes: FIELD_FAILURES.md section 5 (FF 5.1 … 5.7).

| # | Failure mode | Effect | Cause | Design action | S | O | D | AP | Verified by |
|---|---|---|---|---|---|---|---|---|---|
| I-1 | Inrush when the battery is connected | Spark, pitted terminals, BMS trips (FF 5.3) | Empty bus capacitors (4.7 mF) | Pre-charge through 10 Ω 50 W and a 3 A diode (0.11 s, 5.2 A at most); the 150 A contactor closes only above 91 % of the battery (comparator with hysteresis) | 6 | 2 | 2 | L | simulation: inverter.test.ts I-1 (below 5.5 A, closes above 91 %, then EN) |
| I-2 | Battery connected the wrong way round | Bridge body diodes short the battery, fire (FF-17) | Installer | Pre-charge diode blocks; contactor coil and control fed after the input diode DAUX (QK's body diode cannot energise the coil); measuring dividers after DAUX (no negative input voltage); class T fuse as the last line | 9 | 3 | 2 | L | simulation: inverter.test.ts I-2 (below 50 mA, bus and aux at 0 V) |
| I-3 | Shoot-through in a leg | MOSFETs destroyed (FF 5.1.4) | Dead time, driver undervoltage, noise; three gates (58 nF) too slow for the driver alone: 0.9 µs to turn off against 0.5 µs dead time (found in simulation: 617 A through a leg) | D44H11/D45H11 emitter follower per switch drives its three gates (about 0.2 µs); IR2184 drivers with fixed dead time and undervoltage lockout; 10k gate–source resistors hold the gates off while the 12 V is missing; while stopped, the drivers' shutdown inputs (SD) hold all four switches off | 9 | 2 | 3 | L | simulation: inverter.test.ts start-up at 5 kW (stress check of every part); to do: stress check at 58.4 V |
| I-4 | Overload, short circuit, motor start | MOSFETs destroyed (FF 5.1.1) | Loads draw 3–7 × at start | Cycle-by-cycle limit at twice the rated peak (519 A): the shunt straight into a window comparator (an LM358 amplifier first took 9 µs: 217 A overshoot) pulls the drivers' SD low, all four switches off for at least 20 µs, so the current returns to the bus through the body diodes where the shunt sees it (holding the driver inputs low turned both low sides on: the short-circuit current freewheeled past the shunt and rose every period, to 215 kA in simulation); an overload timer latches the bridge off after about 1.3 s at the limit (longer than a motor start; the shunt and switches would overheat long before the heatsink sensor reacts) | 9 | 3 | 2 | L | simulation: inverter.test.ts I-4 (dead short: below 650 A, timer latches off, no part over its ratings); to do: motor start |
| I-5 | Transformer DC saturation | Current rises every cycle until the bridge fails (FF 5.1.6) | Unequal half-cycles (switch, comparator, dead-time asymmetry); 0.25 % is enough for 20 A through the 3 mΩ primary | Sine reference without DC by construction (square VME ± VA/2, no coupling capacitor); DC servo: JFET differential integrator holds the primary's mean voltage at zero (loop time constant 30 ms; its reset FET's body diode first conducted and drove the primary to 14 V DC, and 0.135 s was too slow: found in simulation) | 9 | 2 | 2 | L | simulation: inverter.test.ts start-up (primary mean current below 2 A and steady) |
| I-6 | Unequal sharing of paralleled MOSFETs | One device overloaded (FF 5.1.2) | Gate oscillation, layout | Gate resistor per device (4.7 Ω); three devices per switch with 2.6 × margin at the rated current; layout symmetry (PFMEA) | 7 | 3 | 4 | M | simulation: stress check per device in the start-up and short-circuit runs (equal models: real sharing needs the layout, PFMEA) |
| I-7 | Avalanche at turn-off | MOSFET damage (FF 5.1.3) | Leakage and wiring inductance | 100 V MOSFETs on a 58.4 V maximum bus (58 %); film bus capacitors at the bridge and four low-ESR electrolytics that damp the battery cables' inductance (film alone: a short circuit rang the bus to 113 V); peak V(DS) below 80 V in the stress check | 8 | 3 | 3 | L | to do: stress check at 58.4 V |
| I-8 | Deep discharge, restart at low battery | Battery damage, chattering (FF 5.4) | No hysteresis | Low cut-out 42 V, restart only above 47 V (any fault restarts only above 47 V); the sense filtered (4.5 ms) so it follows the battery, not the bus at each current-limit cycle | 6 | 3 | 2 | L | simulation: inverter.test.ts I-8 (41 V and 45 V: no start; 48 V starts) |
| I-9 | Overvoltage of the battery side | MOSFETs and capacitors stressed | Charger fault, BMS open | High cut-out 61 V with hysteresis, filtered (4.5 ms: the bus jumps 10–15 V for microseconds when the bridge turns off a limit peak) | 7 | 2 | 2 | L | simulation: inverter.test.ts I-9 (62 V: no start; 58.4 V starts) |
| I-10 | Output overvoltage | Loads destroyed | Voltage loop or its sense open | Independent overvoltage (own sense transformer, own TL431, LM393 of its own), trips at 262 V, latched until the battery is disconnected (the first latch values held only 0.6 V and released itself: found in simulation); FAULT LED | 9 | 2 | 2 | L | simulation: inverter.test.ts I-10 (latched, output below 5 V) |
| I-11 | Heatsink overtemperature | Device failure (FF 5.7) | Dust, fan-less hot climate, sustained overload | No fan; NTC on the heatsink stops the bridge above 90.7 °C, restart at 87.5 °C (a 100k feedback first lifted the threshold out of the NTC's reach: the cut-out never tripped, found in simulation) | 7 | 3 | 2 | L | simulation: inverter.test.ts I-11 (95 °C: no start; 85 °C starts) |
| I-12 | Hum and audible whine | Complaints, transformer stress | PWM in the audible range | 20 kHz PWM | 3 | 2 | 3 | L | analysis |
| I-13 | Parallel and three-phase operation | Circulating current, units fight (FF 5.6) | Phase or amplitude mismatch | Planned (P7c): shared reference sine and fault line (no sync, no output); droop sharing | 8 | — | — | — | open (P7c) |

## 6. Open actions (not yet closed by design or test)

| # | Design | Action | AP |
|---|---|---|---|
| C-14 | change-over | Terminal temperature-rise test, box-clamp terminals, torque label | H → M |
| C-15, all | all | Enclosure: IP54, membrane vent, mesh ≤ 1 mm, coating; damp heat cyclic test (IEC 60068-2-30), salt mist (IEC 60068-2-52) | M |
| C-9 | change-over, stabiliser | Varistors with thermal disconnector and indicator (type 3 SPD part) | M |
| S-7 | stabiliser | Thermal cut-out in the autotransformer winding | M |
| M-16 | charger | Installation guide items (DC isolator, DC SPD, connectors, ground fault) | H |
| all | all | Layouts (P8): creepage for pollution degree 3, coating keep-outs, power tracks per IPC-2221 | M |

## 7. How to keep this DFMEA current

Every design change re-runs the tests named above (they are part of the unit suite). A new
failure mode found in the field or in a test is added here with its root cause, its action
and the test that verifies the action; the rating is changed only when the test exists.
