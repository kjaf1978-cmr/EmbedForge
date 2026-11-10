# Power electronics and installation track (decision D20, 14 October 2026)

Owner requests of 14 October 2026, run alongside Increment 3. Schematics and simulation are
verified first; each design then gets its PCB layout with the Increment 3 tools.

## Rules for every part and example

- **Purchasable values and ratings:** resistors from E24 (5 %) or E96 (1 %), capacitors and
  inductors from E12/E24; power ratings, voltage ratings and current ratings from the
  standard steps the catalogues offer. The electrical rule check flags anything else and
  proposes the nearest standard value (VER-13).
- **Catalogue parts only:** semiconductors, magnetics and protection parts are generic
  catalogue parts with datasheet ratings (MOSFETs, IGBT modules, gate drivers, comparators,
  varistors, gas discharge tubes, contactors, breakers). No manufactured end product (no
  ready-made inverter, charger, stabiliser or monitoring relay) is used as a part: those are
  the designs, built from the components.
- **Verified:** every example has tests that check its function against hand calculations
  (output voltage, frequency, efficiency estimate, trip thresholds, clamping voltage) and its
  stress check against the ratings.

## Steps

| Step | Content | Verification |
|---|---|---|
| P1 | Standard values and ratings: E6/E12/E24/E96, standard power/voltage ratings; ERC rule with the nearest standard value, quick fix in the inspector; examples brought in line | Unit tests; every example clean |
| P2 | New devices in the engine: varistor (MOV, V = k·I^(1/α)), gas discharge tube (spark-over, arc voltage), thermal-magnetic circuit breaker (B/C/D curves) and residual-current trip, contactor (3 or 4 poles + auxiliary contacts), comparator with open-collector output (LM339/LM393), PV module (single-diode model from datasheet Voc, Isc, Vmp, Imp, irradiance and temperature), tapped transformer / autotransformer, half-bridge gate driver, surge sources (8/20 µs current, 1.2/50 µs voltage) | Unit tests against datasheet points; ngspice where a SPICE equivalent exists |
| P3 | Phase monitoring and change-over: window comparators on each phase, phase-loss and asymmetry detection, delays, contactor change-over between two sources, single-phase and 3P+N | Trip thresholds and delays in transient tests |
| P4 | Mains voltage stabiliser: relay-switched taps of an autotransformer under comparator control | Output kept in band over the input range |
| P4b | Mains voltage stabilisers with relay-switched taps for 5, 10 and 15 kVA loads (D27): tap switching by contactors or zero-current thyristors (owner's choice at the start of P4b), autotransformer, breaker, surge arresters and output cut-off sized per rating | Output kept in band over the input range at full load; tap changes without overlap of two taps; stress check and DFMEA fault tests per variant |
| P5 | Surge and lightning protection: SPD type 1/2/3 coordination (GDT, MOV), earthing and equipotential bonding, mains house compared with PV house (DC-side SPDs, array earthing) | 8/20 µs and 1.2/50 µs surges: let-through voltage at the appliance |
| P6 | Solar battery charger: PV array, synchronous buck converter, MPPT (fractional-Voc, analogue), CC/CV charge control, 48 V battery model; 5–30 kWh, parallel units | Charge current and voltage limits; MPPT tracking; stress check |
| P7 | Inverters (D30): two architectures, each with its DFMEA, compared: (a) low-frequency — MOSFET full bridge on the battery, sine PWM, 50 Hz transformer; (b) high-frequency — full bridge and ferrite transformer to a ~400 V DC bus, IGBT sine-PWM bridge, LC filter. Ratings by battery voltage: 12 V up to 1.5 kW, 24 V up to 3 kW, 48 V 5 kW per unit; 10–30 kW by paralleled 48 V units with droop current sharing; 3 × 400/230 V from three units | Output voltage, frequency, THD (FFT), load step, motor start (surge), stress check of every device |
| P9 | Agricultural and industrial designs (D24): irrigation up to 64 channels with soil-moisture sensors (microcontroller sequencing, discrete sensor interfaces and valve drivers); pump control; borehole pump from tank level with overflow detection (discrete); electric grass/brush trimmer with its sensors and protections; block moulding machine (system design, motors, vibration, hydraulics, safety circuits, microcontroller sequence); gate controller with infrared remote command (D25); grinder machine electronics with variable speed and high torque (D26) | Function, protections and DFMEA fault tests per design |
| P8 | PCB layouts of these designs with the Increment 3 tools (power tracks per IPC-2221, clearances for mains voltage) | DRC |

Order (decisions D21, D24, 15 October 2026; D27, 16 October 2026): P1–P4, then P6, P7, P4b, P5, P9, P8.

High-power designs are simulated as circuits (switching transients over a few mains periods);
thermal design (heatsinks) is given as calculations, not simulated.

## Progress

### P3 — change-over (done)

Two examples, `changeover-1p` and `changeover-3p` (app/ui/src/eda/powerExamples.ts), built from
catalogue parts only: per phase a 1 VA 230/12 V sense transformer with a 220 Ω + 100 nF
snubber, DB107 bridge, 4.7 µF, 68k/10k divider; a TL431 reference split by 2.1k/4.22k/12.1k
(E96) into the two thresholds; LM393/LM339 comparators; 10k/4.7 µF delay; IRLZ44N coil drivers
with 12 V Zener gate clamps; 24 V DC contactors (32 A, 2- or 4-pole) interlocked through their
NC auxiliary contacts; C32 breakers. The 3P+N design adds a diode-OR of the three rectified
phases scaled by 768k/100k as the asymmetry threshold.

Measured in the tests (tests/power.test.ts, power3.test.ts, power3step.test.ts):

| Condition | Single-phase | 3P+N |
|---|---|---|
| Trip while connected | below 195 V (194 trips, 196 holds), above 253 V (252 holds, 254 trips) | 190 V or 256 V on one phase trips; 250 V on all holds |
| Accepted at start-up | about 197 … 250 V (194 and 256 rejected, 200 and 248 accepted) | 230 and 240 V accepted; 190 V and a lost phase rejected |
| Reconnect after a trip (hysteresis) | about 205 … 245 V (200 and 250 stay on back-up, 210 and 240 reconnect) | — |
| Asymmetry | — | one phase 12 % below the others trips (start-up and while connected), 7 % holds |
| Interlock | never both contactors carrying current at any time point | same |
| Stress check | every part within its ratings at 230 V | same |

The thresholds were set on the simulated sense ripple (minima for undervoltage, peaks for
overvoltage) and the hysteresis is larger than that ripple, so a voltage near a threshold does
not make the contactors chatter.

Found on the way and fixed in the engine: a bridge on a transformer secondary that starts with
a non-zero source voltage (any phase other than 0°) did not converge. When the bridge stopped
conducting, the leakage inductance faced an open circuit, because the diodes had no junction
capacitance. Rectifier diodes and bridges now have their datasheet junction capacitance (checked
against ngspice at 1 MHz), and the sense transformers in both designs have realistic winding
resistance, magnetising inductance and leakage, with the RC snubber that a real board needs for
the resulting ringing.

### P4 — mains voltage stabiliser (done)

Example `stabiliser`: a step-type stabiliser for a 1 kVA load. The input feeds one of seven
taps of a tapped autotransformer (150, 170, 190, 210, 230, 250, 280 V) and the output is
taken from the 230 V tap, so V_out = V_in·230/tap. Six 12 V relays in a chain select the
tap; each one's NC contact feeds the next, so two taps can never be connected, even while a
relay changes over. The input is sensed like the change-over (transformer, snubber, bridge,
68k/10k) and filtered to its mean (100k/470 nF). Six LM339 comparators against a TL431 ladder
(E96) switch at 160 / 180 / 200 / 220 / 240 / 265 V in, with 1 MΩ feedback for about 3 V of
hysteresis. BC547B drivers with 1N4148 flyback diodes drive the relays.

A seventh comparator delays the output relay after power-on, using 1 MΩ·1.5 µF against VREF
(0.35 s here; 3–180 s in a stabiliser for appliances). The first simulation showed why it is
needed: with the sense filter still empty at power-on, every relay is on, the 150 V tap is
chosen, and the load would see about 346 V for 0.2 s, with 14 A through the relay contacts.

Verified (tests/stabiliser.test.ts): 6 V either side of every step and at 140 and 300 V, the
right tap is chosen and the output is V_in·230/tap within 2 % and within 230 V ± 10 %
(215 … 246 V over 140 … 300 V). The load is connected only after the delay and never sees
more than 253 V. A sag from 230 to 195 V while running steps down a tap and the output
recovers. The stress check is clean at 140 V (largest input current) and 226 V.

### P4 — redrawn as the product (decision D28, 16 October 2026)

The owner found the first drawing unusable: parts with net labels on every pin and no wires.
The stabiliser is now drawn as the circuit diagram of the product (pilot of D28):

- **Wired:** every connection inside a functional block is a wire (automatic orthogonal
  wiring, checked against the netlist: no pin may change its net); supply rails are power
  symbols; only signals between blocks (VIN, N, T5, SF, VREF, N1 … N6, OD, DLY) carry labels.
  No two parts overlap (test).
- **Physically complete:** screw terminals L in, N in, PE, L out, N out, PE; the 12 V control
  supply is built from the input (fuse 0.2 A, 230/27 V 25 VA transformer with RC snubber, DB107,
  2200 µF 63 V, LM317HV on an 8 K/W heatsink: 11.5 … 12 V over 140 … 300 V in); the mains
  neutral N is a separate conductor, the control ground is bonded to PE (PELV).
- **Parts as bought:** two LM339 packages (taps 1–4; taps 5–6, the restart delay and one
  spare) and an LM393 of its own for the independent output protection, each with a 100 nF
  decoupling capacitor. A spare comparator has + on ground and − on a reference, so its output
  is held low: an unused comparator left open can oscillate and disturb the others in its
  package. Packages are chosen so that a design has at most one spare (change-over 1P: two
  LM339, one spare; 3P+N: three LM339 and an LM393, none; charger: the independent latch in an
  LM393 and the other seven in two LM339, one spare).
- **Product values in the drawing:** restart delay 1 MΩ (one resistor, the largest the board-leakage rule allows) and 4.7 µF film
  against 80 % of the rail: about 7.6 s, independent of the rail; DDIS empties the capacitor at
  every supply interruption. The tests use a 220 nF capacitor (0.35 s) to keep the runs short.
- **The test bench** (mains source with its earthed neutral) and the test load are drawn
  outside the product.

Found on the way: every LED of the power designs was red (the colour is the LED's `colour`
property, not its value); the protection comparator's output current was 24 mA when it
discharged the delay capacitor (16 mA allowed): a 2.2k in the discharge path and a 4.7k for the
FAULT LED bring it to 13 mA. The simulation engine now solves with a sparse LU (lists of the
non-zeros per row and column), about twice as fast for the power designs.

### The other power designs redrawn (D28) and the design document (D29)

The change-overs (1P and 3P+N) and the MPPT charger are drawn the same way as the stabiliser:
wired blocks, power symbols, terminals, packages as bought, no overlapping parts (tests).

- **Change-overs:** the 24 V control supply is built from both sources (a 230/27 V transformer
  and bridge on each, in parallel, then the LM317HV), so the controller runs on whichever
  source is present. Product timing in the drawing: return delay 10 µF, dead time 680 nF; the
  tests use 100 nF and 68 nF.
- **MPPT charger:** the 12 V auxiliary supply comes from the PV input (22k, BZX55C13, MJE340
  emitter follower, 100 µF), so it is alive whenever there is sun. The battery switch QB2 now
  takes its gate drive from the battery terminal through 470k / 1M, a zener and the
  optocoupler OPB; with the earlier drive from the auxiliary rail, a reversed battery could
  draw 32 A through the body diode. The FAULT latch is reset by opening the PV isolator (at
  night it resets by itself).
- **Rails:** a rail counts as driven when a regulator output is on its net. Before, the
  simulation could treat a drawn rail as an ideal source. All tests were run again after
  this fix.

**Design document (D29):** Export → "Design document (.pdf)" or "(Word .docx)" gives:
- the description
- the schematic as vector graphics: the complete circuit on one large page (the smallest ISO
  format from A3 to A0 that holds it at a readable scale: the four power designs are A0, text
  at least 5.3 pt / 1.9 mm, still 1.3 mm when the same page is printed on A1), then an A3
  overview with the tile grid and the enlarged A3 tiles A1, A2 … for office printers. Export →
  "Schematic, one large page" gives the large page alone, for a plotter or print shop
- the costed bill of materials: manufacturer part number, distributors with order numbers,
  and the price for 1 and for 100 pieces
- the reliability prediction
- the design's DFMEA, maintenance and FAQ at the end

The drawings are readable (owner's note, 16 October): no reference, value or net name lies on
a part, on other text or on a wire of another net (tests/drawing.test.ts, every example). The
router keeps text and the way out of each pin free, and places the net names after all the
wiring, where no later wire can cross them.

The Parts tab shows the same catalogue columns and the total, and its CSV export includes
them. Prices are estimates as of October 2026, not live quotes (each line says so); check
them with the distributor before ordering. The battery fuse is a Class T 160 V DC
(JJN-100), not a 32 V automotive fuse.

### No wasted parts (decision D31, 16 October 2026)

Owner: no part without a function, in every design, now and in the future. Audit of the four
power designs (all parts listed with their nets and checked one by one):

| Design | Removed | Why it was not needed |
|---|---|---|
| change-over 1P | LM393 and its decoupling capacitor; 2 spare LM339 units | seven comparators fit two LM339 |
| change-over 1P, 3P+N | the 10k gate resistors of the two contactor drives (2 each) | the comparator's 10k pull-up already limits the Zener and gate current |
| change-over 3P+N | 2 spare LM339 units | three LM339 and an LM393 hold the fourteen comparators exactly |
| stabiliser | 2 spare comparators (protection in an LM393 now); 470k + 68k of the restart delay | one 1 MΩ resistor gives the same delay (0.8 % shorter) |
| MPPT charger | the spare half of the TL072 (now a single TL071); two LM393 packages | the independent overvoltage latch keeps its own LM393, the other seven comparators fit two LM339 |
| inverter (P7a) | the LM358 shunt amplifier and four resistors; one of two FETs holding the driver inputs; a bleed resistor of the overload timer | the shunt goes straight into the window comparator; both drivers' SD pins share one FET; the timer empties through its own resistors. All six IC packages are full (the freed LM358 unit is the overload timer) |

Kept on purpose, each with its function in the drawing's notes or the DFMEA: one spare unit
where an odd count leaves it (its inputs held so it cannot oscillate); one decoupling capacitor
per IC; RC snubbers at transformer secondaries and relay contacts; two 750k in series where
1.5 MΩ is needed (no single resistor above 1 MΩ in a humid climate); the separate sense
transformers and references of the independent protections. Every new design is audited the
same way before release, and the tests count the spare units.

### P4b — stabilisers 5, 10 and 15 kVA with thyristor taps (D27, D41; DFMEA section 3b)

`src/eda/stabiliserT.ts` (`stabiliserT({ kva })`). The 1 kVA unit's sense, reference ladder,
comparators, restart delay and independent protection; the taps of a 5 / 10 / 15 kVA
autotransformer (150 … 280 V) switched by seven anti-parallel thyristor pairs (VS-40TPS12 at
5 kVA, VS-70TPS16 at 10 and 15 kVA, on a heatsink of 0.6 / 0.3 / 0.2 K/W) instead of relays.

- Firing: per pair an opto-triac (FOD4218, 800 V, random phase) between 470 Ω from each side,
  through a diode to each thyristor's gate: whichever thyristor is forward biased fires each
  half cycle while the LED is on. A yellow LED in series shows the tap.
- Tap logic (CMOS at 12 V): the comparators' states O1 … O6 are latched (three CD4013); the
  decoder (CD4001) gives one tap; six XOR (CD4070) and a diode OR give CHG, "a change is
  pending", which takes every gate off (CD4081).
- Break-before-make: each pair's voltage lights its own PC817 through two 22k 1 W and a bridge;
  the seven phototransistors in series pull OFFN low only when every pair blocks. After
  0.15 ms of that the latch takes the new tap and its pair fires. A pair that has failed short
  never blocks, so no second tap is fired onto it.
- Power-up hold 0.3 s; output contactor (32 / 65 / 95 A, Siemens 3RT2027/2037/2046-1NP30)
  after the restart delay. Its coil is on the 230 V tap through the output relay and is a
  wide-range 200–277 V AC/DC type. At the lowest input (140 V) that tap gives only 213 V,
  93 % of a 230 V coil and close to its 85 % pull-in, and the 10 and 15 kVA outputs never closed
  in simulation; protection: 190 … 255 V, a change stuck for 0.12 s,
  heatsink above 85 °C. Input: breaker 40 / 80 / 125 A C, 20D471K.

Verification: `tests/stabiliserT.test.ts` (TEST_REPORT.md section 3m).

### P5 — surge and lightning protection (D20; DFMEA section 3c)

`src/eda/surge.ts`, installation designs (DIN-rail SPDs, earthing, wiring), verified by
simulation (`tests/surge.test.ts`, TEST_REPORT.md section 3n). The cables are their inductance
(about 1 µH per metre of conductor) and resistance; the SPDs coordinate through them.

Mains house (TN-C-S, single phase): main board: a varistor-based type 1+2 SPD L–PE (275 V,
Iimp 12.5 kA 10/350 µs, Up ≤ 1.5 kV) at the PEN split (main earthing terminal on an earth
electrode of ≤ 10 Ω); 10 m (10 mm²) to the sub-board: a type 2 SPD L–PE (275 V, In 20 kA) and a
600 V gas discharge tube N–PE; 15 m (2.5 mm²) to the socket of sensitive appliances: a type 3
outlet (14D431K L–N and L–PE, GDT N–PE). Results: the appliance sees at most about 850 V L–N and
800 V L–PE for 12.5 kA 10/350 µs and 20 kA 8/20 µs into the service line and for a 6 kV / 3 kA
combination wave at the socket (overvoltage category I: 1.5 kV); every SPD within its ratings.
Without the type 3 outlet the socket surge reaches the appliance at 5.75 kV, and the induced
surge at 1.86 kV L–PE: sensitive appliances need it. (A spark-gap type 1 SPD, Up 4 kV, would need
a second type 2 within a few metres.)

PV house (the 48 V MPPT charger's array, three 280 Wp in series, 25 m of DC cable with its PE
conductor alongside): two 20D201K (170 V DC) in Y (DC+ and DC− to the frame) in the array box,
one DC+ to PE at the charger (its DC− is the battery's negative, bonded to PE) and a 5KP130A
(5 kW TVS) across the charger's input. With 5 kA 8/20 µs induced into the cable the charger's
input sees 195 V, under its 200 V MOSFETs; without the TVS 205 V. **P6 change:** the charger's
board gets the 5KP130A across its PV input (beside RVPV).

### P9 — pump control, irrigation, gate controller, trimmer, block machine (D24, D25; DFMEA section 3d)

Five of the P9 products, simulated as circuits (the irrigation, gate and block machine sequencing runs on a
microcontroller board, D24; everything around it is discrete).

**Pump control** (`src/eda/pumpControl.ts`, `tests/pumpcontrol.test.ts`): purely discrete, for
a borehole or transfer pump (230 V, up to 1.5 kW) filling an elevated tank.
- Electrodes: stainless rods, one common per tank (LOW, HIGH, OVERFLOW) and one in the source
  (DRY). They are fed with a 200 Hz square (NE555) through capacitors, so no DC flows through
  the water (no electrolysis, no scaling). Each sensing electrode is peak-detected and compared
  with 2 V (LM339): up to about 25 kΩ of water reads wet, a broken cable reads dry. A broken LOW
  cable therefore starts the pump (it still stops at HIGH); a broken HIGH cable lets OVERFLOW stop
  it and latch a fault.
- Times from a 1 Hz NE555 clock and three CD4020 counters, each clock gated by the output that
  ends its count: 8 s start delay after a power cut (Q4), a dry lockout of 8.5 min after the
  water has come back (Q10), a maximum run of 2.3 h (Q14: a burst pipe, a pump that no longer
  delivers). RC timers of minutes were rejected: an electrolytic's leakage makes them unreliable.
- Logic: CD4001 NOR gates as the RUN latch (set below LOW, reset at HIGH or when the permit
  goes) and the FAULT latch (set by OVERFLOW or the maximum run, reset by the RESET button and
  at power-up); the permit is a diode AND of the start delay, the dry lockout and no fault.
- Output: BC547B driving a 12 V relay, which drives a 9 A (AC-3) contactor with a 230 V coil;
  breaker 10 A (motor curve) for the pump. Supply: a small 230/15 V transformer, LM317HV to 12 V,
  TL431 reference.
- Verified (TEST_REPORT.md section 3o): the normal cycle (starts below LOW, stops at HIGH, never
  near OVERFLOW), a broken HIGH cable, the source running dry, a burst pipe and the start delay
  after power-up; the tests run the clock 1000× faster (its capacitor), the counts unchanged.

**Irrigation controller, field interface** (`src/eda/irrigation.ts`, `tests/irrigation.test.ts`):
up to 64 zones with soil-moisture sensors.
- Valve outputs: eight 74HC595 shift registers on 3.3 V (from the microcontroller's SPI), each
  output through 1 kΩ into an IRLML0060 (60 V, SOT-23) with 10 kΩ gate-to-source; an SS34
  Schottky flyback diode across each valve (24 V DC solenoids, 0.45 A inrush, 0.3 A hold) and an
  SMAJ33A at each field terminal against surges on the long valve cables. Gate drive is 3.3 V on
  purpose: with 5 V a shorted valve drew 17 A, beyond the MOSFET's 11 A pulse rating; with 3.3 V the
  MOSFET limits the current itself.
- Overcurrent cut-off: all valve currents return through one 0.1 Ω shunt. Above 2.2 A (a shorted
  valve or cable) an LM393 trips and latches (its output holds its own sense input high through
  10 kΩ and a 1N4148). It raises the registers' OE (a BC557B), pulls every gate low at once (a
  BAT54 per channel into one 2N2222A: the gates' discharge peaks at 190 mA, over a BC547B's
  100 mA) and interrupts the microcontroller, which clears the latch (CLR) and skips the zone.
- Power-up: the registers come up with random contents, so the cut-off trips itself (10 nF from
  5 V through a 1N4148 into the latch for about 1 ms). Every output stays off until the firmware has
  loaded the registers and cleared it. A 100 kΩ pull-up on OE alone was loaded down to 0.7 V and
  let a valve conduct (found in simulation).
- Sensor inputs: 0–3 V capacitive probes powered from 3.3 V. Each input has an SMAJ5.0A at the
  terminal, 10 kΩ in series, BAT54 clamps to 0 V and 3.3 V, and 100 nF, then goes to a 74HC4051
  multiplexer per eight sensors (on 3.3 V: a CD4067 on 5 V would not see the 3.3 V address lines as
  high) and the microcontroller's ADC. With 1 kΩ and the clamps alone, a 1 kV line surge reached
  6.8 V and burnt 6 W in the resistor.
- The product (`src/eda/irrigationBoards.ts`, boards in `hardware/irrigation-main/` and
  `hardware/irrigation-module/`): a main board and up to eight 8-zone channel modules on a 20-way
  ribbon cable. One 64-zone board would need about 250 field terminals; each module carries its
  eight zones' terminals along one edge (per zone: valve +24 V and output; sensor +3.3 V, signal,
  0 V), two 74HC595 (the valves; the second enables the module's multiplexer and passes the chain
  on), a 74HC4051 and the channel circuits above. The main board: 24 V in through a 3.15 A fuse, an
  SS34 against reverse polarity and an SMAJ33A; 5 V from an R-78E5.0-1.0 switching regulator (a 7805
  would dissipate 11 W at 0.6 A); 3.3 V from an AMS1117-3.3 for the registers, multiplexers and
  sensors; the sensors' supply switched by an AO3401, on only while the firmware scans them (64
  probes draw about 0.3 A); the ESP32-DevKitC-32E on two 19-pin sockets (its antenna over the
  board's edge); the overcurrent cut-off; pull-downs on the bus's clock, data and address lines
  while the module boots. The bus carries V24 and the valves' return (SRET) on two conductors
  each: the firmware opens one valve at a time, two at most.
- Firmware (D24, the board emulation of Increment 4): load every register (valves off,
  multiplexers off), then pulse CLR (IO4); to scan, switch the sensors on (IO26 low), wait 20 ms,
  enable one module's multiplexer, set A0–A2 (IO16, IO17, IO25), read IO36; to water, set the
  zone's bit and pulse RCLK (IO5; data IO23, clock IO18); OE high on IO34 means the cut-off has
  tripped: clear every bit, mark the zone, pulse CLR. A watchdog and a run-time limit per zone
  (DFMEA IR-4).
- Supply: 24 V DIN-rail supply (for 8 modules: 24 V 2.5 A, e.g. Mean Well HDR-60-24).
- Verified (TEST_REPORT.md section 3o): power-up with a register output high (no valve current;
  the cut-off latched until cleared); switching a valve on and off (0.3 A, the drain below 30 V
  at turn-off); a valve shorted while on (the cut-off latches within 10 µs, the MOSFET is above
  11 A for under 2 µs); a 2 kV 1.2/50 µs surge on an idle valve's cable (the drain below 60 V);
  a 1 kV surge on a sensor cable (the multiplexer input stays within −0.3 … 3.6 V). No part is
  over its ratings in any of these.

**Gate controller** (D25; `src/eda/gate.ts`, `tests/gate.test.ts`): a sliding or swing gate with
one 24 V DC gear motor (up to about 100 W; the model: 2.6 A running, 12 A stalled) and an infrared
remote. The microcontroller board decodes the remote (TSOP38238, 38 kHz) and sequences
open / stop / close. Everything that keeps the gate safe is discrete and works whatever the
firmware does.
- Direction: two SPDT power relays (Song Chuan 832A-1C-S, 24 V coil, 30 A), driven by BC547B
  from the microcontroller. Released, both motor terminals sit on the switch node: the motor is
  shorted and brakes. Both energised, both terminals sit on 24 V: no current, so no command can
  short the supply.
- On/off: an IRLZ44N in the switch node's return (gate from RUN through 1 kΩ), a 0.01 Ω shunt, an
  MBR20100CT freewheel diode to 24 V and an SMAJ33A at each motor terminal (long motor cables).
- End stops: the open and close limit switches (NC, opened by the gate at its end) are in series
  with their relay's coil, and the photo-beam's NC contact is in series with the close relay's
  coil. The end stops and the beam stop the motor in hardware; dividers (47k/10k) report them to
  the microcontroller.
- Cut-off (LM393, latching): a short circuit above 25 A trips within microseconds; an obstacle
  above 7 A for about 0.1 s trips it too, blanked for the first 0.5 s of a run (the motor's start).
  It turns the MOSFET off (its gate clamped through a BAT54), interrupts the microcontroller
  (FAULT), and stays tripped until the firmware clears it (CLR) and reverses briefly. It trips itself
  at power-up, so the motor cannot move before the firmware runs.
- Supply: 24 V 150 W DIN-rail supply, 10 A fuse, SMAJ33A, 470 µF; 7805 for the 5 V logic.
- Microcontroller (on the board): an Arduino Nano on sockets (5 V I/O, the commands' level in the
  simulation) and a TSOP38238 IR receiver on 100 Ω and 4.7 µF behind the enclosure's window.
  FAULT on D2 and the receiver on D3 (the interrupt pins), OPEN D5, CLOSE D6, CLR D7, RUN D9, the
  limit and beam inputs on A0, A1. Firmware (D24, Increment 4's board emulation): decode the
  remote (a code learnt per remote and a rolling counter, DFMEA GC-7), switch RUN off before a
  relay changes, clear the cut-off (CLR) after a fault and reverse briefly.
- Verified (TEST_REPORT.md section 3o): opening (start peak 10 A, 2.5 A running) up to the open
  limit, which stops and brakes the motor while the firmware still commands it; an obstacle while
  closing (stall 10.5 A, the cut-off latches about 80 ms later); the motor cable shorted (29 A peak,
  latched within microseconds); the beam broken while closing; both relays commanded; power-up
  with RUN high. No part is over its ratings in any of these.

**Trimmer drive** (D24; `src/eda/trimmer.ts`, `tests/trimmer.test.ts`): a cordless grass and
brush trimmer, 36 V Li-ion pack (10 cells, 25 … 42 V), brushed DC motor of about 500 W (13–16 A
cutting). Purely discrete.
- Trigger switch (power-tool type, 25 A DC): its main contact feeds the motor and the electronics
  (no standby drain), its pot sets the speed, and its brake contact shorts the motor when released.
  Releasing it also resets every protection. The switch must break before it makes: about 5 ms of
  travel between the main and the brake contact (usual for power-tool switches with a brake). In
  that gap the input capacitors fall below the 27.5 V cut-off and the drive turns off before the
  brake contact closes. With both contacts changing at once, the capacitors discharged through
  the brake contact and the MOSFET at 836 A (found in simulation).
- Drive: IRFP4110 (100 V, 4.5 mΩ) below the motor at 20 kHz, an STTH6003 freewheel diode across
  the motor, a 5 mΩ shunt, 2 × 470 µF + 1 µF at the input.
- PWM: an NE555 gives the 20 kHz clock and a 4–8 V ramp. A CD4001 NOR latch is set at the start of
  each period and reset when the ramp passes the set point (the trigger, through a soft start of
  about 0.5 s), when the motor current passes 40 A (cycle-by-cycle limit: a jammed head cannot
  destroy the MOSFET or the brushes), or on a fault. The drive is NOR(Q̄, SET): driving from Q̄
  alone gave a 2 µs pulse every period at zero duty, because a NOR latch has both outputs low
  while set and reset are both high (found in simulation). BD139/BD140 emitter followers drive the
  gate.
- Protections (LM339 and LM393 onto one open-collector line, held by a PNP latch until the trigger
  is released): a jam (the cycle-by-cycle limit acting for about 1 s: the mean shunt current is no
  measure, since the limit holds the duty low and the motor current circulates through the
  freewheel diode), the battery below 27.5 V (the cells'
  2.75 V; the pack's BMS is the second line), and above 85 °C at the MOSFET's heatsink or in the
  motor (an NTC each). A 50 ms power-up blanking keeps comparators that settle as the rails rise
  from latching a fault. A red LED shows a latched stop.
- Supply: LM317HV to 12 V, TL431 2.5 V reference.

**Block moulding machine** (D24; `src/eda/blockMachine.ts`, `tests/blockmachine.test.ts`):
hollow and solid concrete blocks.
- The machine: a 3 kW mixer/feeder, two 1.5 kW vibrator motors under the mould table, a 7.5 kW
  hydraulic power pack with 4 solenoid valves (tamper head and mould lift), and the pallet pusher.
  Each 400 V motor has a motor-protective circuit breaker and a contactor with a 24 V DC coil.
  A microcontroller board runs the sequence (fill, vibrate and press, demould, eject) from the
  proximity sensors' end positions and its timings.
- Safety circuit (discrete, the part simulated):
  - two-channel emergency stop: an E-stop with two NC contacts, and two safety contactors K1/K2
    (9 A, 24 V DC, mirror contacts to IEC 60947-4-1 Annex F) whose main contacts in series feed the
    safety rail V24S. Every contactor coil and valve of the machine is fed from it, so the E-stop
    stops every motion whatever the microcontroller does;
  - reset: RESET in series with the NC mirror contacts of K1, K2 and every motor contactor (pump,
    mixer, both vibrators: a welded contact refuses the reset), then 100 µF into a reset relay K3. K3 gives K1 and K2 a pulse of
    about 0.2 s, and they hold through their own auxiliary contacts. A held or jammed RESET cannot
    restart the machine after an E-stop. (The capacitor straight into the contactors' coils decayed
    before they pulled in, found in simulation.)
- Outputs: the pump contactor's coil and the solenoid valves through IRLZ44Ns from the
  microcontroller. Each valve is clamped at 38 V (SMAJ33A), so it releases within a few
  milliseconds; a plain diode would hold it for tens.
- Inputs: PNP proximity sensors through PC817s.
- The board (`hardware/block-machine/`): the safety circuit, K3, the coil drivers for the pump,
  mixer and both vibrators' contactors, the four valve channels, six proximity-sensor inputs and
  START (each a PC817), an R-78E5.0-1.0 for 5 V, and an Arduino Nano on sockets (5 V I/O, as the
  outputs are simulated): inputs on D2–D8, PUMP D9, valves D10–D12 and A3, MIXER A0, vibrators A1,
  A2, the safety rail's state on A4 (47k/10k from V24S). The 400 V wiring, the contactors and the
  motor-protective breakers are on the panel (`panel.csv`). Every output's gate has 10 kΩ to 0 V:
  all off while the Nano resets, and nothing moves without V24S anyway.

### P6 — MPPT solar charger (done: one 3.7 kW unit; DFMEA in DFMEA.md)

Example `mppt-charger`: 9 × 410 Wp (3 in series, 3 strings, Voc up to 120 V in the cold) into a
48 V (16-cell LiFePO₄) battery. A 20 kHz buck converter: IRFP4668 (200 V) on a heatsink,
STTH6003 freewheeling diode, 56 µH, film capacitors on both sides (no electrolytics in the
power path, FF-01), half-bridge gate driver with bootstrap. Analogue control from LM358,
LM339, LM393, TL071, TL431 and 555 parts:

- **MPPT, fractional Voc:** every 10 s the converter stops for 50 ms, the open-circuit voltage
  is held on a sample-and-hold (2N7000, 1 µF film, TL071) and 0.826 × Voc is the set point
  of the PV voltage loop. A first design that held a constant PV voltage lost 10 % of the power
  on a hot roof (65 °C cells); fractional Voc follows the temperature.
- **Charge control:** average current-mode control, an inner current loop; outer loops pull the current reference down for
  the PV voltage (MPPT), the battery voltage (CV 56.6 V, 3.54 V per cell) and the current
  limit (80 A, or less with a resistor RLIM for small batteries: table in the example's notes).
- **Protections (each tested as a fault):** PV reversed (back-to-back MOSFETs in the PV lead),
  battery reversed (MOSFET in the battery lead with gate drive from the right polarity only),
  reverse current at night (ideal diode in the negative lead), Q1 shorted (independent
  overvoltage latch at 57.6 V cuts the array and the battery off; FAULT LED), BMS opens while
  charging (fast stop within one period; output held below 62 V by a 5KP64A TVS), battery
  outside 0 … 50 °C and heatsink above 90 °C (NTC windows), open or shorted NTC (no charging).

Verified (tests/charger.test.ts, charger2, charger3, charger.faults):

| Condition | Result |
|---|---|
| 1000, 500, 200 W/m² at 25 °C; 1000, 300 W/m² at 65 °C | array at ≥ 97 % of its maximum power; ≥ 93 % reaches the battery; inductor peak < 110 A |
| deeply discharged battery (44 V) | 75 … 82 A (limit 80 A) |
| nearly full battery (56.4 V) | held at 56.4 … 56.8 V, current < 20 A (the bound is (V − 56.4 V) / 10 mΩ: 5 mV of regulation is 0.5 A) |
| hot case: 1000 W/m², 65 °C air and cells | every power semiconductor below Tj 125 °C on its heatsink |
| 7 DFMEA fault cases (above) | the protection acts as designed |

Larger batteries (10–30 kWh) use several units in parallel, one array each; the outputs are
blocked against reverse current, so they share without interaction.

### P7a — inverter, 50 Hz transformer type (one 5 kW unit, 48 V; DFMEA section 5)

Example `inverter-lf` (src/eda/inverters.ts): 16-cell LiFePO₄ battery (42 … 58.4 V) → class T
fuse → pre-charge (10 Ω, 1N5408) and a 150 A DC contactor with a 48 V coil → film and two
low-ESR electrolytic bus capacitors → MOSFET full bridge (3 × IRFP4468 per switch, IR2184
drivers, D44H11/D45H11 gate buffers) with unipolar sine PWM at 20 kHz → 27.5/230 V 5 kVA
transformer, 10 µF filter → 230 V 50 Hz. Analogue control: 555 and CD4013 for an exact 50 Hz,
a square VME ± VA/2 and a 4th-order Butterworth for the sine (no DC by construction), a DC
servo on the primary, an averaging voltage loop with soft start and a peak limiter (the loop
cannot wind up during a current limit and overshoot afterwards), a window comparator on the
shunt (twice the rated peak, all four switches off for 20 µs), an overload timer, battery
window, heatsink cut-out and an independent latched output overvoltage protection (its sense
filtered over 21 ms, so it rides through one peak when a large load is disconnected and trips
within about 60 ms of a real fault).

Verified by simulation (tests/inverter.test.ts; the runs with the bridge switching take 3 to
35 minutes each and run with `npm run test:long`; results in TEST_REPORT.md section 3h):

| Condition | Result |
|---|---|
| 5 kW, 52 V, start from a charged bus, 140 ms | 230 V ± 3 % (229.5 V), THD below 3 % (2.5 %), 50 Hz, no overshoot, no DC in the primary (mean current below 2 A and steady), every part within its ratings |
| connecting the battery (I-1) | pre-charge below 5.5 A, contactor closes above 91 % of the battery, then the bridge starts |
| battery reversed (I-2) | nothing conducts |
| short circuit from the start (I-4) | bridge current below 650 A (limit 519 A), the overload timer latches the bridge off, no part over its ratings |
| 41, 45, 48, 58.4, 62 V; heatsink 85 and 95 °C (I-8, I-9, I-11) | stops or starts as designed |
| voltage-loop sense open (I-10) | the independent protection trips and holds the bridge off |
| 5 kW at 58.4 V, fully charged (I-7) | every part within its ratings, MOSFET voltage at turn-off included |
| motor start at half load (I-4): locked rotor, about 85 A, for 50 ms | the current limit holds, nothing trips, back to 230 V −10 % … +5 % about 40 ms after the disconnect; the first half cycle after the disconnect peaks at 127 % (bound 130 %); no product part over its ratings |

Reliability (RELIABILITY.md): 238 parts, 1956 FIT, 58 years at 45 °C. Still to do for P7a:
a person's look at the drawing. The design runs slowly in the app: 60 ms (the example's
default) take about 12 minutes.

### Boards (D43–D45)

The worked designs' boards are KiCad projects in `hardware/` (see its README): placed by a plan for
the power section and from the schematic for the control, routed with Freerouting, checked with
KiCad's design rule check; each with its fabrication files and a parts list with order numbers
and prices. Done: the stabiliser (P4), both change-overs (P3, control board and DIN-rail panel with
its wiring list), the MPPT charger (P6, power board in 4 oz copper with soldered copper bars and
M5 lugs, and control board). The inverters' boards follow their re-verification (D42).

### P7c — the 50 Hz-transformer inverter's 24 V and 12 V units (D33)

`inverterLF({ cells: 8 })` (24 V, 3 kW) and `inverterLF({ cells: 4 })` (12 V, 1.5 kW) from the
P7a drawing: the transformer, battery window, contactor, fuse, current-limit thresholds and
test loads per unit (`LF_VARIANTS`); the DC servo's input resistors scaled with the bus. The
12 V unit adds its own 9 V control rail (LM2940-9.0; the drivers stay on the battery), a
6.25/230 V transformer, a 28 mF bus (6 × 4700 µF 35 V) and a pre-charge through 1 Ω and an
STTH6003. Shared with P7a since these runs: the DC servo's reset of both capacitors, the flux
servo (UFX), the square's high half from VME (D34) and the average-type independent
overvoltage protection (D35). Verified by simulation at the D32 corners, every DFMEA test of
section 5 (TEST_REPORT.md section 3j); the 12 V unit's THD bound is 5 % (D34: 3.2 % measured).

### P7d — units in parallel and as three phases (DFMEA I-13, H-18)

`src/eda/inverterLink.ts` (the link module and the link box), `src/eda/inverterSystem.ts` (a
system of units joined into one sheet for simulation). 10–30 kW: two to six 48 V units of either
architecture in parallel on one line; 3 × 400/230 V: three units (or three groups) on L1, L2, L3
with N common. Each unit takes a plug-in **link module** (the same board in both architectures,
on the side of the control that makes the sine: the 50 Hz unit's control, the high-frequency
unit's high-voltage side); one **link box** per system.

- Why a phase-locked loop: the unit's sine is its 50 Hz square through a 4th-order 70 Hz
  Butterworth filter, −118° at 50 Hz and 1.4° per 1 % of its corner frequency (±7° with 5 %
  capacitors). One unit's transformer leakage and windings make about 0.8 Ω, so 1° between
  two units drives about 2.5 A r.m.s. between them (11 % of the rating). The module's own 555
  (VCO, 200 Hz) and CD4013 (÷4) make the unit's 50 Hz (jumper JQ in position B), and its
  phase comes from the unit's own sine: the sine's zero crossings (LM393, 12 mV hysteresis)
  XOR the reference (CD4070), a PI integrator (LM358, 470k / 470k + 220 nF, 10 nF) and the
  555's control pin (33k, 4.7 µF; ±7 % hold range). Locked, every unit's sine sits a quarter
  period from the reference, whatever its filter's tolerance. With the reference lost, the
  integrator holds the frequency (no DC: the unit's own square keeps running).
- Pilot: 5.6 MΩ into the square's summing node keeps a ±0.13 V sine while the bridge is
  stopped, so the loop locks before the bridge starts.
- Run loop (fail-safe): a 2.7 mA current loop from the box runs in series through every
  unit's transmitter (PC817, closed once the unit's EN has been high for 0.5 s: 1 MΩ, 2.2 µF
  against VREF, LM393) and receiver (PC817; open, QKL pulls QEN's base low and ENN restarts
  the soft start). A unit that stops, loses its supply or is unplugged opens the loop: all
  units stop together and start together when it is ready again (three-phase motors never
  run on two phases). A latched fault stays until that unit is reset.
- Droop: a 1:1000 output current transformer (Talema AC1030 class), bridge and 100 Ω, 47 ms
  average, ×2.9: 1 MΩ into the voltage loop's sense node lowers the output by 3 % at the
  rated current; the trimmer (10 k, 1 MΩ into the same node) sets each unit's no-load output
  at commissioning (233.5 V, each unit alone): 233.5 V at no load, about 226.5 V at full load.
- Link box (on the battery, 42 … 58.4 V): LM317HV to 15 V, 555 at 300 Hz and a
  self-correcting three-stage Johnson counter (two CD4013, one CD4011: D2 = Q1·(Q2 + Q̄3), so
  either illegal state returns to the sequence within two clocks) give three 50 Hz squares
  120° apart; a 5 mA current sink per phase drives that phase's sync loop (through each unit
  on the phase in series) and a 2.7 mA sink the run loop. Up to six units per loop.

Wiring: per unit a 4-wire cable (sync in/out, run in/out) daisy-chained from the box; the
outputs to the line through each unit's own breaker; N and the battery negatives common.
Verification: TEST_REPORT.md section 3l (`tests/inverterlink.test.ts`).

### P7b — inverter, high-frequency type (one 5 kW unit, 48 V; DFMEA section 6)

Example `inverter-hf` (src/eda/inverters.ts, `inverterHF`): the same battery side as P7a (class
T fuse, pre-charge, 150 A contactor, battery window, heatsink NTC) feeds a phase-shifted full
bridge at 40 kHz (2 × IRFP4468 per switch, bipolar gate buffers) → a 1:12 ferrite transformer
(reinforced isolation between the battery and the 230 V side) → four C4D20120A SiC rectifier
diodes, 470 µH and 4 × 470 µF 450 V → a regulated 381 V bus → an IGBT full bridge
(IKW50N60T, IR2184 drivers) → 470 µH and 10 µF → 230 V 50 Hz.

- DC-DC control on the battery side: 555 clock, two D flip-flops for the two legs (leg B
  clocked by the end of the current-mode ramp), peak current sensed by a 1:200 current
  transformer in the bridge's supply (so it also sees the DC that would walk the core into
  saturation; in the return its burden lifted the low MOSFETs' sources by 16 V) with slope
  compensation, a 4 µs leading-edge blanking in which the transformer resets through a
  24 V 5 W Zener (it then never saturates, even at the highest duty), soft start, and the bus voltage fed back across the
  barrier by a TL431 and an optocoupler.
- Bus side: an auxiliary 15 V supply from a small 1:1 transformer on leg A (a 50 % square
  at any load, so it does not collapse at no load), its undervoltage lockout, a bus window
  (starts at 355 V, stops at 325 V) and an independent latched bus overvoltage protection
  (LM393, 425 V trip, 404 V release, precision dividers) that switches the converter off through a second optocoupler.
- Sine bridge: hybrid modulation. Leg B switches at 50 Hz and holds the neutral at the
  protective earth (bonded on the battery side), leg A carries the 20 kHz PWM. The output
  therefore has no 20 kHz common-mode voltage. The Y capacitors from the bus to earth do
  not ring, and only one filter inductor is needed. The voltage loop, current limit,
  overload timer and output overvoltage protection are the same circuits as P7a
  (`inverterControl`), supplied from the 15 V on the bus side. The 50 Hz reference comes
  from the battery side through an optocoupler; the neutral leg's peak and valley detectors
  are closed-loop (an op amp with its diode inside the loop) so they follow the bus without
  the 0.2 V slew error that raised the THD to 5 %.
- DC-DC overload: if the current-mode command stays at its ceiling for about 0.5 s (a short on the
  bus, or a load above what the battery side can carry), an LM393 timer latches the
  converter off; a bus short (H-4) is therefore not a sustained current limit.
- Shared with P7a since D32: soft start 47 ms (no overshoot at −10 °C), the voltage loop's
  integrator on its clamped node (anti-windup), and an instantaneous output voltage limit at
  about 355 V peak that stops the bridge through the current limit's path (a load dump is
  clipped within a PWM period; the loop alone acts half a cycle late through the sine filter).
- Verified by simulation on the final circuit (TEST_REPORT.md section 3i, DFMEA section 6):
  start-up at 5 kW at +60 °C (junctions 125 °C), −10 °C and with end-of-life electrolytics
  (230 V, THD below 3 %, no DC, bus within 381 V ± 6 %, every part within its ratings); the
  sine bridge alone; the battery connection; the battery window and heatsink; 5 kW at 58.4 V;
  short circuit and motor start at the output; the loop's sense open; the bus feedback lost and
  the bus shorted, and the start-up at 27 °C.
