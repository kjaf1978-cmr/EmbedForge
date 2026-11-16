# Mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps (P4b): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first.

## 1. Where it goes

```
supply ── breaker (upstream) ── X1 L in / X2 N in / X3 PE ── stabiliser ── X4 L out / X5 N out / X6 PE ── distribution board of the loads
```

- **Fixed wiring only**, to its own circuit. The unit's breaker QF1 switches L and N together
  (2-pole) and protects its internal wiring.
- **Upstream protection and supply.** The supply must deliver the input current at the lowest
  input voltage: 36 / 71 / 107 A at 140 V. Size the supply cable and its upstream protection for
  that. The output breaker QF2 (C 25 / 50 / 80 A) protects the output cables: at the buck taps
  the output current is larger than the input current, so QF1 alone would not.
- **Short-circuit rating.** QF1 breaks 6 kA (40 A, 1P+N) or 25 kA (80 A, 125 A, S800C). The
  prospective short-circuit current at the unit must not exceed it.

## 2. Earthing and RCD

- **Earthing.** PE runs through the PE stud on the chassis: input PE (X3) → PE stud → output PE
  (X6). The enclosure, its door, the DIN rail and the transformer core are bonded to the stud.
  The control board's ground is bonded to the stud by one conductor (terminal XPE).
- **The control is live.** The control board and the contactor coil circuits are not isolated
  from the mains (no PELV claim): treat them as live.
- **RCD protection.** The stabiliser is an autotransformer: the output is not separated from the
  input. An RCD in front of it protects the output circuits too. Use a type A RCD sized for the
  rated current, or RCDs in the distribution board of the loads.
- **Neutral.** Do not switch or break N on its own anywhere between the stabiliser and the grid.

## 3. Cables and terminals

PVC-insulated copper, IEC 60364-5-52 method C at 30 °C; derate for a warm enclosure or bundling.

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| L in, N in, tap leads, input contactor and tap contactors | 6 mm² | 16 mm² | 35 mm² |
| Links between a tap contactor's three poles (both sides) | 6 mm² | 16 mm² | 25 mm² (or the maker's paralleling links) |
| L out, N out | 6 mm² | 16 mm² | 25 mm² |
| PE in and out | 6 mm² | 16 mm² | 16 mm² |
| Board feeds (behind their own fuses), 24 V coil wiring | 1.5 mm² | 1.5 mm² | 1.5 mm² |
| Auxiliary contacts to the board | 0.75 mm² | 0.75 mm² | 0.75 mm² |

The power terminals X1 … X6 are DIN-rail terminal blocks sized for these cables.

## 4. Enclosure, mounting, heat and torques

- **Enclosure.** Metal, at least IP40 indoors (IP54 in damp or dusty places), with glands and
  strain relief for the power cables.
- **Mounting.** The autotransformer (tens of kilograms: the winder states its weight) is bolted to the
  enclosure's base or floor-standing. Mount the unit upright, out of the sun, with free air above
  and on the sides.
- **Heat.** The transformer's losses (a few percent of the rating at full boost), the contacts and
  four coils of about 22 W each (a tap, KI, KM; a second tap during a change). Ventilation slots at
  the bottom and the top; keep 20 cm free above. Type test TT-1 measures the temperature rise.
- **Contactors on the DIN rail,** in the order of the tap leads; the three poles of each tap
  contactor linked on both sides (paralleled poles, so each carries a third). Their auxiliary
  contacts (NO 13-14 of each tap contactor, NC 21-22 of KI) wired to the board's panel connector
  as panel.csv lists: these wires carry the check that keeps two taps from ever being connected,
  so do not swap them.
- **Torques.** The values printed on each device or in its datasheet. Mark each tightened screw.

## 5. Rating plate

- maker, model, size, serial number, year;
- input 140 … 300 V~ 50 Hz, maximum input current (36 / 71 / 107 A);
- "Tap changes interrupt the output for about 0.3 s";
- output 230 V~ ± 10 %, rated power and current;
- protection class I symbol and IP code;
- "Autotransformer: the output is not isolated from the mains";
- the indicator meanings (USER_MANUAL.md section 2).

## 6. Motors and compressors

- **Tap-change gap.** About 0.3 s per change (0.25 … 0.4 s): motors slow down but do not stop; contactors in
  the loads (about 20 ms drop-out) may drop out and must restart by themselves or be held by
  their own control. Equipment that cannot tolerate it needs a UPS.
- **No backfeeding source on the output.** An inverter, a generator or a PV system on the
  output side would keep the winding live while KI is open, and the tap contactors would then
  switch current. Connect such sources only on the supply side of the stabiliser, or through a
  change-over that disconnects the stabiliser.
- **Restart delay.** About 8.5 s. A refrigeration compressor without its own restart protection
  needs a 3-minute restart-delay relay of its own.
- **Starting current.** Count about three times the running power of each motor.

## 7. Before handing over

Commissioning (COMMISSIONING.md), including the calibration of both sense circuits, with the
loads disconnected (QF2 off) until the protection checks are done.
