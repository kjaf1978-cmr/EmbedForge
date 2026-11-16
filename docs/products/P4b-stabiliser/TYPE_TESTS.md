# Mains voltage stabilisers 5, 10 and 15 kVA (P4b): prototype type tests

The circuit is verified by simulation (tests/stabiliserT.test.ts, LONG=1; DFMEA section 3b). The
tests below cover what a simulation cannot:

- heat, and the thyristor modules' and heatsink's real thermal resistances;
- the transformer as wound, and short circuits with the real fuses;
- surges, the enclosure and compliance.

They are run on the first prototype of each size (or of the 15 kVA and 5 kVA, with the 10 kVA by
interpolation, if the owner decides so) before the design is released for production.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Temperature rise at full load, maximum boost and maximum buck | rated resistive load; enclosure closed; 25 °C; until stable. Input 140 V (the 150 V tap: 36 / 71 / 107 A in), then 300 V. Thermocouples on the heatsink, a module's base, the winding, the contactor, the terminals and the boards | heatsink below 70 °C at 40 °C ambient (extrapolated), so it never trips at rated load; modules' junctions within rating (from the base temperature and the datasheet); winding within class F | ST-5, ST-12 |
| TT-2 | Fan failure | TT-1 at 140 V with the fan disconnected | the heatsink trip opens the output at 70 °C; nothing exceeds its rating | ST-5 |
| TT-3 | Thermal cut-out of the transformer | the winding heated (blocked vents, 1.3 × rated load at 140 V) | it opens at 115 °C ± 5 °C; no tap fires (no yellow LED), the output opens; it resets itself; the output returns after the restart delay | ST-12 |
| TT-4 | Tap changes under load | 1 000 changes at rated load (the input switched between 215 and 225 V by a timer), resistive and at power factor 0.8 | no change ever fires two pairs (the current in each module recorded at 20 changes: one pair at a time, the gap between them under 1 ms); no fault | ST-1 |
| TT-5 | Two gates lit (fault injection) | a pair board's gate driver bridged by a jumper, at no load; then the same at 25 % load, behind the aR fuse | every gate off and FAULT latched within one half cycle; the output stays off until switched off; at load, if a section short occurs, the aR fuse clears it and nothing else is damaged | ST-1b, ST-10 |
| TT-6 | Short circuit at the output | a bolted short at X4–X5 at 230 V, on a supply with at least the prospective current of the intended installation | the aR fuse or QF1 clears it; the modules survive (or only the aR fuse is replaced) | ST-10 |
| TT-7 | Independent protection | as P4 TT-5: KO's driver bridged, the input raised past 310 V and lowered below 124 V | the output opens every time, by KP | ST-6 |
| TT-8 | Start-up | 50 switch-ons each at 140, 230 and 300 V, rated load | no pair fires before the hold; the first tap fired is the right one; the load sees nothing before the restart delay | ST-3 |
| TT-9 | Surge | IEC 61000-4-5, 2 kV L–N and 4 kV L–PE combination wave, 5 of each polarity, powered | no damage, no spurious firing that shorts a section; the varistor within 423 … 517 V afterwards | ST-9 |
| TT-10 | Damp heat, cyclic | IEC 60068-2-30, 40 °C, 93 % RH, 6 cycles, powered | insulation ≥ 1 MΩ, thresholds within ± 4 V | ST-13 |
| TT-11 | Electrical safety | dielectric strength (as the product standard requires) between L/N and PE, XPE disconnected; earth bond resistance; leakage current | as the applicable standard (IEC 61558 for the transformer, IEC 60335-1 or the relevant product standard) | — |
| TT-12 | Conducted emission | IEC 61000-6-3 (residential) at rated load with tap changes | within the limits (switching at the current zero should keep it low) | — |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
