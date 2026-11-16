# Mains voltage stabilisers 5, 10 and 15 kVA (P4b): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first.

## 1. Where it goes

```
supply ── breaker (upstream) ── X1 L in / X2 N in / X3 PE ── stabiliser ── X4 L out / X5 N out / X6 PE ── distribution board of the loads
```

- **Fixed wiring only**, to its own circuit. The unit's breaker QF1 switches L and N together
  (2-pole) and protects its internal wiring.
- **Upstream protection and supply.** The supply must deliver the input current at the lowest
  input voltage: 36 / 71 / 107 A at 140 V. Size the supply cable and its upstream protection for
  that. The aR fuse inside protects only the thyristors.
- **Short-circuit rating.** QF1 breaks 6 kA (40 A, 1P+N) or 25 kA (80 A, 125 A, S800C). The
  prospective short-circuit current at the unit must not exceed it.

## 2. Earthing and RCD

- **Earthing.** PE runs through the PE stud on the chassis: input PE (X3) → PE stud → output PE
  (X6). The enclosure, its door, the heatsink and the transformer core are bonded to the stud.
  The logic board's control ground is bonded to the stud by one conductor (terminal XPE).
- **The control is live.** The logic and pair boards are not isolated from the mains (no PELV
  claim): treat them as live.
- **RCD protection.** The stabiliser is an autotransformer: the output is not separated from the
  input. An RCD in front of it protects the output circuits too. Use a type A RCD sized for the
  rated current, or RCDs in the distribution board of the loads.
- **Neutral.** Do not switch or break N on its own anywhere between the stabiliser and the grid.

## 3. Cables and terminals

PVC-insulated copper, IEC 60364-5-52 method C at 30 °C; derate for a warm enclosure or bundling.

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| L in, N in, tap leads, thyristor module leads | 6 mm² | 16 mm² | 35 mm² |
| L out, N out | 6 mm² | 16 mm² | 25 mm² |
| PE in and out | 6 mm² | 16 mm² | 16 mm² |
| Board feeds (behind their own fuses) | 1.5 mm² | 1.5 mm² | 1.5 mm² |

The power terminals X1 … X6 are DIN-rail terminal blocks sized for these cables.

## 4. Enclosure, mounting, heat and torques

- **Enclosure.** Metal, at least IP40 indoors (IP54 in damp or dusty places), with glands and
  strain relief for the power cables.
- **Mounting.** The autotransformer (tens of kilograms: the winder states its weight) is bolted to the
  enclosure's base or floor-standing. Mount the unit upright, out of the sun, with free air above
  and on the sides.
- **Heat.** The thyristor heatsink carries about 30 / 65 / 150 W at full load and 140 V; its fan
  draws air from below and blows it out at the top. Keep 20 cm free above the outlet. The
  transformer's losses (a few percent of the rating at full boost) come on top; type test TT-1
  measures the temperature rise.
- **Torques.** The values printed on each device or in its datasheet. Mark each tightened screw.

## 5. Rating plate

- maker, model, size, serial number, year;
- input 140 … 300 V~ 50 Hz, maximum input current (36 / 71 / 107 A);
- output 230 V~ ± 10 %, rated power and current;
- protection class I symbol and IP code;
- "Autotransformer: the output is not isolated from the mains";
- the indicator meanings (USER_MANUAL.md section 2).

## 6. Motors and compressors

- **Restart delay.** About 8.5 s. A refrigeration compressor without its own restart protection
  needs a 3-minute restart-delay relay of its own.
- **Starting current.** Count about three times the running power of each motor.

## 7. Before handing over

Commissioning (COMMISSIONING.md), including the calibration of both sense circuits.
