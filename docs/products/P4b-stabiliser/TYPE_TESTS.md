# Mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps (P4b): prototype type tests

The circuit is verified by simulation (tests/stabiliserT.test.ts, LONG=1; DFMEA section 3b). The
tests below cover what a simulation cannot:

- heat, and the transformer as wound (saturation, inrush);
- the contactors as built (their timing, the auxiliaries' contact at low current, wear);
- short circuits with the real breakers, surges, the enclosure and compliance.

They are run on the first prototype of each size (or of the 15 kVA and 5 kVA, with the 10 kVA by
interpolation, if the owner decides so) before the design is released for production.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Temperature rise at full load, maximum boost and maximum buck | rated resistive load; enclosure closed; 25 °C; until stable. Input 140 V (the 150 V tap: 36 / 71 / 107 A in), then 300 V. Thermocouples on the winding, the tap contactor in use, KI, KM, the pole links, the terminals and the board | every part within its rating at 40 °C ambient (extrapolated); winding within class F; the paralleled poles within 10 K of each other | ST-1, ST-10 |
| TT-2 | Thermal cut-out of the transformer | the winding heated (blocked vents, 1.3 × rated load at 140 V) | it opens at 115 °C ± 5 °C; KI opens, the output goes off; it resets itself; the output returns after the restart delay | ST-10 |
| TT-3 | Contactor timing | at 230 V, no load and full load: KI's and the tap contactors' opening and closing times, with the 24 V supply at 22 and 26 V; 50 changes | no tap contactor's main pole moves while KI's pole is closed (KI's pole and the tap poles recorded on a scope); the gap 0.15 … 0.4 s | ST-2, ST-9 |
| TT-4 | Tap changes under load (accelerated life) | 20 000 changes at rated load (the input switched between 215 and 225 V by a timer), resistive and at power factor 0.8; then KI's contacts inspected | no fault; no tap contactor's contacts marked by arcing; KI's wear consistent with the maker's AC-1 life curve (at least 1.5 million operations by extrapolation) | ST-2, ST-3 |
| TT-5 | Match check (fault injection) | (a) a tap contactor's armature held closed (a welded pole simulated) while the input is stepped so that another tap is wanted; (b) one tap contactor's coil wire disconnected; (c) the 13-14 wires of two tap contactors swapped | (a), (b): KI never closes, FAULT on, the output off, no current between taps; (c): found at the first change (KI stays open): the commissioning wiring check catches it | ST-1, ST-1a |
| TT-6 | Short circuit at the output | a bolted short at X4–X5 at 230 V, on a supply with at least the prospective current of the intended installation | QF2 (or QF1) clears it; no contactor welded | ST-7 |
| TT-7 | Independent protection, lost neutral | as P4 TT-5: KO's driver bridged, the input raised past 310 V and lowered below 124 V; then 400 V L–N for 10 s (a lost neutral) at no load | the output opens every time, by KP; at 400 V the varistor's disconnect or the supplies' fuses act, the output stays off, no fire | ST-6, ST-14 |
| TT-8 | Surge | IEC 61000-4-5, 2 kV L–N and 4 kV L–PE combination wave, 5 of each polarity, powered | no damage, no tap change that connects two taps; the varistor within 423 … 517 V afterwards | ST-11 |
| TT-9 | Start-up and inrush | 50 switch-ons each at 140, 230 and 300 V, rated load; KI's closing current recorded | no tap contactor carries current before KI closes; the right tap; the load sees nothing before the restart delay; QF1 never trips on KI's inrush into the transformer | ST-5 |
| TT-10 | Damp heat, cyclic | IEC 60068-2-30, 40 °C, 93 % RH, 6 cycles, powered | insulation ≥ 1 MΩ, thresholds within ± 4 V, the match level MS within 3.5 … 4.1 V | ST-13 |
| TT-11 | Electrical safety | dielectric strength (as the product standard requires) between L/N and PE, XPE disconnected; earth bond resistance; leakage current | as the applicable standard (IEC 61558 for the transformer, IEC 60335-1 or the relevant product standard) | — |
| TT-12 | Conducted emission | IEC 61000-6-3 (residential) at rated load with tap changes | within the limits | — |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
