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
| P7 | Inverters: 12/24/48 V DC to 230 V 1-phase and 3 × 400/230 V: HF DC-DC stage (full bridge, ferrite transformer, rectifier) to a DC bus, SPWM full bridge or 3-phase IGBT bridge, LC filter; ratings 5–30 kW by paralleled devices; parallel units with droop current sharing | Output voltage, frequency, THD (FFT), load step, stress check of every device |
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

### P6 — MPPT solar charger (done: one 3.7 kW unit; DFMEA in DFMEA.md)

Example `mppt-charger`: 9 × 410 Wp (3 in series, 3 strings, Voc up to 120 V in the cold) into a
48 V (16-cell LiFePO₄) battery. A 20 kHz buck converter: IRFP4668 (200 V) on a heatsink,
STTH6003 freewheeling diode, 56 µH, film capacitors on both sides (no electrolytics in the
power path, FF-01), half-bridge gate driver with bootstrap. Analogue control from LM358,
LM393, TL072, TL431 and 555 parts:

- **MPPT, fractional Voc:** every 10 s the converter stops for 50 ms, the open-circuit voltage
  is held on a sample-and-hold (2N7000, 1 µF film, TL072) and 0.826 × Voc is the set point
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
| nearly full battery (56.4 V) | held at 56.4 … 56.8 V, current < 15 A |
| hot case: 1000 W/m², 65 °C air and cells | every power semiconductor below Tj 125 °C on its heatsink |
| 7 DFMEA fault cases (above) | the protection acts as designed |

Larger batteries (10–30 kWh) use several units in parallel, one array each; the outputs are
blocked against reverse current, so they share without interaction.
