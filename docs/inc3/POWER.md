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
| P5 | Surge and lightning protection: SPD type 1/2/3 coordination (GDT, MOV), earthing and equipotential bonding, mains house compared with PV house (DC-side SPDs, array earthing) | 8/20 µs and 1.2/50 µs surges: let-through voltage at the appliance |
| P6 | Solar battery charger: PV array, synchronous buck converter, MPPT (fractional-Voc, analogue), CC/CV charge control, 48 V battery model; 5–30 kWh, parallel units | Charge current and voltage limits; MPPT tracking; stress check |
| P7 | Inverters: 12/24/48 V DC to 230 V 1-phase and 3 × 400/230 V: HF DC-DC stage (full bridge, ferrite transformer, rectifier) to a DC bus, SPWM full bridge or 3-phase IGBT bridge, LC filter; ratings 5–30 kW by paralleled devices; parallel units with droop current sharing | Output voltage, frequency, THD (FFT), load step, stress check of every device |
| P8 | PCB layouts of these designs with the Increment 3 tools (power tracks per IPC-2221, clearances for mains voltage) | DRC |

High-power designs are simulated as circuits (switching transients over a few mains periods);
thermal design (heatsinks) is given as calculations, not simulated.
