# Block moulding machine (P9): installation guide

For the machine builder and the electrician. EN 60204-1 (the electrical equipment of machines),
EN ISO 13849-1 (the safety functions), EN ISO 14119 (guard interlocks), EN ISO 4413 (hydraulics)
and the local wiring rules take precedence. The designators are those of the schematic, the board,
the parts list and the wiring list (`panel.csv`).

## 1. The panel

| Item | Part | Note |
|---|---|---|
| Main switch | Q33: 3-pole C 32 A breaker with a padlockable handle | the supply-disconnecting device (EN 60204-1 5.3). It must be worked from outside: a door-coupled rotary handle (red on yellow) or a door-mounted switch-disconnector ahead of it. The panel's short-circuit rating is that of its weakest device: 6 kA (Q33). Do not connect it where the prospective fault current is higher; state the rating on the nameplate |
| Motor-protective breakers | Q34 pump 3RV2021-4AA10 (14 … 20 A), Q35 mixer / feeder 3RV2011-1HA10 (5.5 … 8 A), Q36, Q37 vibrators 3RV2011-1EA10 (2.8 … 4 A), each with an auxiliary contact 3RV2901-1E | set each to its motor's nameplate current. Wire the four auxiliary NO contacts (closed while the breaker is on) in series into input X37 (motor breakers healthy). Check the vibrators' nameplates: 1.5 kW motors of some makers take more than 4 A (then 3RV2011-1FA10, 3.5 … 5 A) |
| Contactors | K5 pump (3RT2026, AC-3 25 A, 24 V DC coil), K6 mixer, K7, K8 vibrators (3RT2016, AC-3 9 A, 24 V DC) | with the 3RV2 breakers: type-2 coordination to Siemens' tables |
| Safety relays | K1 (E-stop), K4 (guards): Siemens 3SK1111-1AB30 | certified, two channels, monitored start; check the terminal numbers against the data sheet |
| Safety contactors | K2, K3: 3RT2016 with a 3RH2911 auxiliary block (mirror contacts) | two poles of each in series (the DC load's breaking) |
| 24 V supply | a 24 V DC 10 A DIN-rail supply with a 400 V input (two phases; for example Mean Well TDR-240-24) behind a 2-pole 6 A breaker | the 24 V's 0 V bonded to PE at one point: terminal X3 (EN 60204-1 9.4.3.1) |
| PE | a PE bar | every motor's PE, the door (a bonding strap), the mounting plate, the hydraulic unit and the machine's frame; the supply's PE conductor |

## 2. The control board

```
X1 +24 V / X2 0 V from the 24 V supply; X3 0 V – PE bond (one point only)
E-stop  (two NC contacts):  X4 – X5 (channel 1), X7 – X8 (channel 2)        → safety relay K1
Guards  (two NC contacts):  X10 – X11 (channel 1), X12 – X13 (channel 2)    → safety relay K4
RESET   (one button, two NO blocks): X15 – X16 (block a), X17 – X19 (block b)
Inputs  (24 V from X50, X51 through the device, back to the input): X6, X9, X14, X18, X20, X21,
        X22, X23, X32, X35, X37
Outputs (+24 V out, 0 V back): the valves X24/X25 … X30/X31; the contactors' coils on the board
Lamp    X53 (+24 V) / X54 (−)
```

| Terminal | Input or output | Device |
|---|---|---|
| X6 | input 1 | proximity sensor: mould up (PNP, NO) |
| X9 | input 2 | proximity sensor: mould down |
| X14 | input 3 | proximity sensor: tamper up |
| X18 | input 4 | proximity sensor: tamper down |
| X20 | input 5 | proximity sensor: feeder home |
| X21 | input 6 | proximity sensor: pallet in place |
| X22 | input 7 | START (NO), on the operator's desk |
| X23 | input 8 | STOP (NC): pressed or its cable broken, the cycle stops |
| X32 | input 9 | pressure switch (NO, closes at the working pressure: set it to about 80 % of the relief valve's setting) |
| X35 | input 10 | oil temperature switch (NC, opens at about 60 °C) |
| X37 | input 11 | the four motor breakers' auxiliary contacts in series |
| X24 / X25 | valve 1 | tamper down |
| X26 / X27 | valve 2 | tamper up |
| X28 / X29 | valve 3 | mould up |
| X30 / X31 | valve 4 | mould down |

- **The valves:** 24 V DC, up to 26 W each, with a plug **without** a built-in diode or LED
  suppressor (the board's bidirectional TVS releases the valve fast; a plug diode would hold it
  for tens of milliseconds). The firmware drives **valve 1 tamper down, 2 tamper up, 3 mould up,
  4 mould down**: wire them so. The outputs are switched on their +24 V side; each is current-
  limited (about 2 A) and read back.
- **Field wiring:** sensors, buttons and switches from X50 / X51 (+24 V behind F2, 2 A) and X52
  (0 V); 0.5 mm² or more, oil-resistant, away from the motor cables, in conduit on the machine.
- **The E-stop:** an EN ISO 13850 E-stop with two NC contact blocks (self-monitoring contact
  blocks where available), at the operator's desk and at every place from which the mould area
  is reached. Several E-stops: their channel-1 contacts in series on X4–X5, their channel-2
  contacts on X7–X8. Each channel's wires in their own cable or sheathed separately (the relay's
  test pulses find a short between the channels; separate routing keeps it unlikely).
- **The guards:** the mould area (the tamper, the mould and the feeder's travel) is closed by
  fixed guards and by interlocked movable guards. Each movable guard has a coded interlock switch
  to EN ISO 14119 (type 2 with a coded actuator, or type 4) with two NC contacts on X10–X11 and
  X12–X13. The vibrators and the mixer coast after a stop: measure the stopping time at
  commissioning (COMMISSIONING section 5); if anything still moves longer than it takes to reach
  in (EN ISO 13855), fit guard locking (an interlock with a solenoid lock, released by a
  standstill monitor or a time delay) instead of a plain interlock.
- **RESET:** a blue push-button with two NO blocks, outside the guarded area, from where the whole
  mould area can be seen (EN ISO 13849-1 5.2.2). The safety relays start on its release.

## 3. The hydraulics (requirements for the hydraulic unit)

The electrical design assumes a hydraulic circuit to EN ISO 4413 with:

| Item | Requirement | Why |
|---|---|---|
| Valves 1/2 (tamper), 3/4 (mould) | 4/3 directional valves, spring-centred, **tandem centre** (P to T, A and B blocked) | with the valves off the pump circulates at low pressure (it starts and idles unloaded) and the cylinders are held |
| Tamper cylinder | a **pilot-operated check valve or counterbalance valve** on its rod / load side, mounted on the cylinder | at an E-stop (the valves and the pump off) the tamper does not fall under its weight or through the spool's leakage |
| Mould cylinders | the same on the lifting side | the raised mould does not drop onto hands |
| Relief valve | set to the working pressure + 10 %, with a gauge | the pressure is limited when a cylinder reaches its end |
| Pressure switch | on the pressure line, NO, to input X32 | PRESS ends at "tamper down" with the working pressure |
| Oil temperature switch | in the tank, NC, opens at about 60 °C, to input X35 | the cycle stops before the oil overheats |
| Manual lowering | a manual release valve (or a hand pump) to raise or lower the tamper and the mould with the machine off | to free a trapped person or a jammed mould without power |
| Accumulator | none (or with an automatic discharge valve on stop) | no stored energy after an E-stop |

## 4. The safety functions and their performance level

| Safety function | Required (estimate, EN ISO 13849-1 Annex A) | Architecture |
|---|---|---|
| E-stop: stop category 0, every motion | PL d | E-stop (two channels) → K1 (PL e) → K2, K3 in series (Cat. 3/4: their mirror contacts monitored at every start) → the rail feeding every coil and valve |
| Guards of the mould area: no motion while open | PL d | guard interlocks (two channels, coded) → K4 (PL e) → K2, K3 as above |
| No unexpected start (power return, RESET held, a welded contact) | PL d | the relays' monitored start on the release; the start loops through the mirror contacts of K2, K3 and every motor contactor |

With B10d = 1 000 000 for the 3RT2016 contactors (Siemens), about 20 stops a day (nop = 6000 a
year), MTTFd per channel is above 100 years (high), DCavg 99 % (the mirror contacts in the start
loops) and Cat. 3: the electrical part reaches PL d, and PL e with Cat. 4 measures (the two
channels' wiring separated, CCF ≥ 65 points). **This is an estimate**: the machine builder
verifies the performance level of each function with the actual components (SISTEMA or
equivalent), including the guard switches and the hydraulic part (the valves centring and the
load-holding valves, which stop the hydraulic motion, and the pump's contactor K5, which removes
the flow). It is part of the machine's CE marking, not of this design (TYPE_TESTS.md).

## 5. Before handing over

Commissioning (COMMISSIONING.md), with the stop-time measurement and the record.
