# Pump controller (P9): prototype type tests

The circuit is verified by simulation (tests/pumpcontrol.test.ts, LONG=1; DFMEA section 3d,
PC-1 … PC-8). The tests below cover what a simulation cannot: real water and electrodes, long
cables, heat, surges and safety. They are run on the first prototype before the design is
released for production.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Electrodes in real water | tap water, borehole water and rain water (low conductivity), clean and scaled rods; each sensing rod in and out 50 times | wet and dry read correctly in each water; the wet/dry threshold between 15 and 40 kΩ | PC-1, PC-2, PC-5 |
| TT-2 | Electrolysis | the rods in water for 30 days, the controller on | no visible corrosion or scale beyond that of rods without excitation | PC-5 |
| TT-3 | Timers | the start delay, the dry lockout and the maximum run measured with a stopwatch (the maximum run by a burst-pipe set-up: the tank's outlet open) | 8 s ± 20 %, 8.5 min ± 20 %, 2.3 h ± 20 % | PC-2, PC-3, PC-4 |
| TT-4 | Independent protection | K1's contact bridged; overflow and dry as COMMISSIONING 4.4, 4.7; then the logic ICs removed | K2 stops the pump every time | PC-1, PC-2 |
| TT-5 | Long electrode cables | 100 m and 300 m of electrode cable (each wire to COM), the rods in low-conductivity water | wet and dry read correctly; if not at 300 m, the installation guide states the limit | PC-1 |
| TT-6 | Surge on the electrode cables | IEC 61000-4-5, 1 kV line to earth on the electrode terminals, 2 kV on the mains | no damage; no false start | — |
| TT-7 | PELV and safety | dielectric strength mains to the control and electrodes (as IEC 61558 requires for reinforced insulation), mains to PE; earth bond; the transformer's and relays' certificates | passes; the creepage between the board's mains and control copper measured ≥ 5.5 mm | PC-7 |
| TT-8 | Pump protection | a 1.1 kW pump's rotor blocked, QF1 set to its rated current | QF1 trips within the time of its class (10 A); the contactor not welded | PC-8 |
| TT-9 | Temperature | the controller in its closed enclosure at 40 °C, the pump cycling for 4 h | the transformer, regulator and relays within their ratings | — |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
