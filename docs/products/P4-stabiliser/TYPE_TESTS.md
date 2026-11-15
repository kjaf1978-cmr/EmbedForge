# Mains voltage stabiliser 1 kVA (P4): prototype type tests

The circuit is verified by simulation (tests/stabiliser.test.ts, POWER.md "P4"). The tests below
cover what a simulation cannot: heat, the transformer as wound, the relays' life, the
enclosure, surges and compliance. They are run once on the first prototype, before the design is
released for production, and they close the DFMEA items marked "type test".

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Temperature rise at full load and maximum boost | 1 kVA resistive at the output, input 140 V (the 150 V tap, 7 A in), enclosure closed, at 25 °C, until stable; thermocouples in the winding (or by resistance), on the relays, the terminals and the LM317HV heatsink; then at 230 V | winding within class F (155 °C at the hottest highest intended ambient); the thermal cut-out does not open at 25 °C; no part above its rating | S-7 |
| TT-2 | Thermal cut-out | the transformer heated (blocked vents, overload 1.3 kVA at 140 V in) until the cut-out opens | the load is cut off at 115 °C ± 5 °C in the winding; it reconnects only after cooling, with the restart delay | S-7 |
| TT-3 | Steps over temperature | commissioning step 4 at 0 °C, 25 °C and 40 °C ambient | every threshold within ± 4 V; the output within 230 V ± 10 % over 140 … 300 V | S-1, S-4, S-10 |
| TT-4 | Relay life (accelerated) | 100 000 tap changes at full load (the input switched between 215 and 225 V by a timer) | no relay welded or sticking; the contact resistance below the maker's limit afterwards; the snubber resistors within rating | S-2, S-3 |
| TT-5 | Independent protection | a tap relay's NO contact bridged by a jumper (as a welded relay); the input raised and lowered | the output relay opens outside 190 … 255 V every time | S-1 |
| TT-6 | Start-up | 50 switch-ons at 140, 230 and 300 V with a 1 kVA load | the load sees nothing above 253 V and nothing before the restart delay | S-5, S-6 |
| TT-7 | Surge | IEC 61000-4-5, 2 kV L–N and 4 kV L–PE combination wave, 5 of each polarity | no damage, no flashover, the output stays in range or cuts off; the varistor within 423 … 517 V afterwards | S-9 |
| TT-8 | Damp heat, cyclic | IEC 60068-2-30, 40 °C, 93 % RH, 6 cycles, powered | insulation ≥ 1 MΩ, thresholds within ± 4 V, no corrosion | S-4 (drift) |
| TT-9 | Electrical safety | dielectric strength 1.5 kV (or as the product standard requires) between L/N and PE; earth bond resistance; leakage current | as the applicable standard (for example IEC 61558 for the transformer, IEC 60335-1 for the appliance) | — |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
