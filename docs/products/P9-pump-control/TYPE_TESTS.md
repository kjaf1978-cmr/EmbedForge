# Pump controller (P9): prototype type tests

The circuit is verified by simulation (tests/pumpcontrol.test.ts, LONG=1; DFMEA section 3d,
PC-1 … PC-12). The tests below cover what a simulation cannot: real water and electrodes, long
cables, heat, surges and safety. They are run on the first prototype before the design is released
for production. The designators are those of the schematic.

| # | Test | Method | Pass | DFMEA |
|---|---|---|---|---|
| TT-1 | Electrodes in real water | tap water, borehole water and rain water (low conductivity), clean and scaled rods; each sensing rod in and out 50 times; then a resistor box between COM and each rod | wet and dry read correctly in each water; the wet/dry threshold between 10 and 25 kΩ | PC-1, PC-2, PC-5 |
| TT-2 | Electrolysis | the rods in water for 30 days, the controller on, in a plastic and in an earthed metal tank | no visible corrosion or scale beyond that of rods without excitation | PC-5, PC-9 |
| TT-3 | Timers | the start delay, the dry lockout and the maximum run measured (the maximum run by a burst-pipe set-up: the tank's outlet open); then RESET with the tank below LOW | 8 s, 8 min, 2.2 h, each ± 20 %; after RESET FAULT stays clear and the pump starts | PC-2, PC-3, PC-4 |
| TT-4 | Independent protection | SW1 held; overflow, dry and each COM return core open as COMMISSIONING 4.4, 4.7, 4.8; then the CD4001 and CD4020 removed; then K7's poles bridged (a welded contactor) | K8 and K5 stop the pump every time | PC-1, PC-2, PC-6, PC-10 |
| TT-5 | Long electrode cables | 50, 100 and 200 m of the intended electrode cable, the rods in low-conductivity water and in air | wet and dry read correctly; the installation guide states the length found | PC-11 |
| TT-6 | Surge on the electrode cables | IEC 61000-4-5, 1 kV line to line and 2 kV line to earth on the electrode terminals, 2 kV on the mains | no damage; no false start | PC-12 |
| TT-7 | SELV and safety | dielectric strength mains to the control and electrodes (as IEC 61558 requires for reinforced insulation), mains to PE, control to PE; earth bond; the transformer's and relays' certificates | passes; the creepage between the board's mains and control copper ≥ 5.5 mm | PC-7, PC-9 |
| TT-8 | Pump protection | a 1.5 kW pump's rotor blocked, Q1 set to its rated current | Q1 trips within the time of its class (10 A); no contactor welded | PC-8 |
| TT-9 | Temperature | the controller in its closed enclosure at 40 °C, the pump cycling for 4 h | T1, the regulator and the relays within their ratings | — |

The product's certification is a separate step (in the EU, CE under the LVD and EMC
directives). It is not part of these tests.
