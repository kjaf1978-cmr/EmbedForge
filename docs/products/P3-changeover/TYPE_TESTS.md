# Mains / back-up change-over (P3): prototype type tests

The circuit is verified by simulation (TEST_REPORT, POWER.md "P3"). The tests below cover what
a simulation cannot: heat in the terminals, the enclosure, the parts' real behaviour, and
compliance. They are run once on the first prototype, of each variant, before the design is
released for production. They close the DFMEA items marked "type test".

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Temperature rise | 1.1 × rated current (35 A per pole) through mains → load, then back-up → load, until stable (about 4 h), enclosure closed, at 25 °C ambient; thermocouples on every power terminal, the contactors and the breakers | terminals ≤ 65 K rise (IEC 61439-1, 9.2); no part above its rating; repeat at the highest intended ambient | C-14 |
| TT-2 | Damp heat, cyclic | IEC 60068-2-30, 40 °C, 93 % RH, 6 cycles; the unit powered on the mains with the varistors and the board in place | after the test: insulation ≥ 1 MΩ, the thresholds within ± 2 V, no corrosion or tracking | C-15, C-12 |
| TT-3 | Ingress | IP54 (IEC 60529): dust and water spray, as for the enclosure's rating with the glands and vent fitted | no water on the board, no dust on live parts | C-15 |
| TT-4 | Transfer timing and interlock | 1000 transfers (mains switched off and on by a timer) with a 30 A resistive load; both contactors' main contacts monitored on a two-channel recorder | never both closed; dead time ≥ 0.3 s every time; return delay 10.5 ± 1.5 s | C-1, C-5, C-6 |
| TT-5 | Thresholds and asymmetry | the commissioning steps 4.1 … 4.9 at 0 °C, 25 °C and 40 °C ambient | within ± 3 V of 195 / 253 V over the range | C-2, C-3, C-4, C-12 |
| TT-6 | Coil-supply lockout | the board's 24 V supplied from a lab supply, lowered from 24 V to 15 V and raised again | both contactors open below 20 V ± 1 V, no chatter | C-7 |
| TT-7 | Surge | IEC 61000-4-5, 4 kV L–PE and 2 kV L–N (combination wave) on the mains and the back-up input, 5 of each polarity | no damage, no wrong transfer, varistors within 423 … 517 V afterwards | C-8, C-9 |
| TT-8 | Short-circuit coordination | prospective 6 kA at the load terminals with the breakers C32 in place | the breaker clears; the contactor not welded (or, if welded, the interlock still holds the other source off) | C-10 |

The certification of a change-over between the grid and a generator is a separate step. In the
EU it means IEC 60947-6-1 (transfer switching equipment) or IEC 61439, and the grid operator's
connection rules. It is not part of these tests.
