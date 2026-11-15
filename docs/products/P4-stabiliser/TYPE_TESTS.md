# Mains voltage stabiliser 1 kVA (P4): prototype type tests

The circuit is verified by simulation (tests/stabiliser.test.ts; POWER.md, "P4"). The tests
below cover what a simulation cannot:

- heat;
- the transformer as wound, and its inrush;
- the relays' life;
- the enclosure, surges and compliance.

They are run once on the first prototype, before the design is released for production. They
close the DFMEA items marked "type test".

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Temperature rise at full load, maximum boost and maximum buck | 1 kVA resistive at the output; enclosure closed; at 25 °C; until stable. Input 140 V (the 150 V tap, 7.1 A in), then 300 V (the 280 V tap). Thermocouples in the winding (or by resistance), on the relays (above all the input relay K8), the terminals and the supply module PS1 | winding within class F (155 °C at the highest intended ambient); the thermal cut-out does not open at 25 °C; no part above its rating | S-7 |
| TT-2 | Thermal cut-out | the transformer heated (blocked vents, overload 1.3 kVA at 140 V in) until the cut-out opens | it opens at 115 °C ± 5 °C in the winding; the input relay and the output relay open (T5–N 0 V); it resets itself after cooling; the output returns only after the restart delay | S-7 |
| TT-3 | Steps over temperature | commissioning section 4 at 0 °C, 25 °C and 40 °C ambient | every threshold within ± 4 V; the output within 230 V ± 10 % over 140 … 300 V | S-4, S-10, S-12 |
| TT-4 | Relay life (accelerated) | 100 000 tap changes at full load (the input switched between 215 and 225 V by a timer) | no relay welded or sticking; the input relay's contact resistance below the maker's limit afterwards; the snubber resistors within rating | S-2, S-3 |
| TT-5 | Independent protection | with K1's driver bridged (a stuck tap relay) and, separately, K7's driver bridged (a stuck output relay): the input raised and lowered | the load is cut off outside 190 … 255 V every time, by K9 | S-1 |
| TT-6 | Start-up | 50 switch-ons each at 140, 230 and 300 V with a 1 kVA load; input current recorded | the input relay closes only after the tap is chosen (no current on the 150 V tap at 230 V or more); the load sees nothing above 253 V, and nothing before the restart delay | S-5, S-6 |
| TT-7 | Surge | IEC 61000-4-5, 2 kV L–N and 4 kV L–PE combination wave, 5 of each polarity | no damage, no flashover; the output stays in range or cuts off; the varistor within 423 … 517 V afterwards | S-9 |
| TT-8 | Damp heat, cyclic | IEC 60068-2-30, 40 °C, 93 % RH, 6 cycles, powered | insulation ≥ 1 MΩ, thresholds within ± 4 V, no corrosion | S-4 (drift) |
| TT-9 | Electrical safety | dielectric strength (as the product standard requires, for example 1.5 kV) between L/N and PE, with X9 disconnected; earth bond resistance from X5 to X8 and to the enclosure; leakage current | as the applicable standard (for example IEC 61558 for the transformer, IEC 60335-1 for the appliance) | — |
| TT-10 | Inrush at the input relay | the input current's peak recorded at 100 reclosures of K8 (tap changes at 230 V and 300 V, no load and 1 kVA), with a current probe | the peak stays below the C10 breaker's magnetic trip (5 × 10 A); otherwise fit the D10 version and repeat; K8's contacts within their making rating | S-3, S-7 |
| TT-11 | Tap-change gap | the output recorded at 20 tap changes, with a 1 kVA resistive load and with a fridge compressor running | gap 40 … 80 ms; no voltage above 253 V at reclosure; the compressor keeps running | S-2 |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
