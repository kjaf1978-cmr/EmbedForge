# Mains voltage stabiliser 1 kVA (P4): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first.

## 1. Where it goes

```
circuit (C16 or B16, RCD 30 mA type A) ── X2 L in / X4 N in / X5 PE ── stabiliser ── X6 L out / X7 N out / X8 PE ── appliance(s) ≤ 1 kVA
```

- **Fixed wiring only.** Connect the stabiliser by fixed wiring to its own circuit, protected by
  a 16 A breaker. Do not fit a plug: with an unpolarised plug, L and N can be swapped.
- **Its own breaker.** The unit's C10 breaker Q1 (1P+N, on the DIN rail inside) switches L and N
  together, and protects the unit's internal wiring and the transformer.
- **Breaker curve.** The transformer is switched on again at every tap change. If Q1 trips at
  switch-on or at tap changes, measure the inrush (TYPE_TESTS.md TT-10) and fit the D10 version
  (S201-D10NA).

## 2. Earthing and RCD

- **Earthing.** PE runs through the PE stud on the chassis: input PE (X5) → PE stud → output PE
  (X8). The enclosure, its door and the transformer core are bonded to the stud. The board's
  control ground is bonded to the stud by one conductor from X9. The board's PE terminals
  carry no output earth current.
- **The control is live.** The control board is not isolated from the mains (no PELV claim):
  treat every part of it as live, and never connect anything to it from outside.
- **RCD protection.** The stabiliser is an autotransformer, so the output is not separated from
  the input. An RCD in front of the stabiliser therefore protects its output circuits too: use
  30 mA type A in the circuit that feeds it.
- **Neutral.** Do not switch or break N on its own anywhere between the stabiliser and the
  grid.

## 3. Cables

- **Input and output:** 1.5 mm² copper (10 A), or 2.5 mm² behind a 16 A breaker. The board's
  terminals take up to 2.5 mm².
- **PE:** X5 (PE in) and X8 (PE out) are 4 mm² DIN-rail PE terminals beside Q1; each is joined to
  the PE stud by 4 mm² green-yellow. 1.5 mm² green-yellow from the board's X9 (control ground)
  to the stud.
- **Inside the unit:**
  - breaker to board, and board to transformer taps: 1.5 mm² H07V-K with ferrules;
  - the thermal cut-out's leads to X1/X3: 0.75 mm², double-insulated.

## 4. Enclosure, mounting and torques

- **Enclosure.** Metal, at least IP40 indoors (IP54 in damp or dusty places), with cable glands
  M20 with strain relief for the input and output cables.
- **Mounting.** The transformer (1 kVA, about 8 … 10 kg) is bolted to the enclosure's base. The
  board stands on 10 mm insulating standoffs; keep at least 8 mm between any mains copper and
  the metal case. Mount the unit upright on a wall or the floor, out of the sun, with 10 cm free
  above and on the sides for air.
- **Heat.** The transformer's losses at full load, typically a few percent of 1 kVA, set the
  temperature rise. The thermal cut-out protects against overheating; TT-1 measures it.
- **Torques.** The values printed on each device or in its datasheet. Typical values (check):
  ABB S200 breaker 2.8 N·m; PCB terminal blocks 7.62 mm 0.5 … 0.6 N·m; DIN-rail terminals
  4 mm² 0.6 … 0.8 N·m; PE stud M6 4 N·m. Mark each tightened screw.

## 5. Rating plate

On the enclosure:

- maker, model, serial number, year;
- input 140 … 300 V~ 50 Hz, 7.1 A maximum;
- output 230 V~ ± 10 %, 1 kVA, 4.3 A;
- the protection class I symbol, and the IP code;
- "Autotransformer: the output is not isolated from the mains";
- the indicator meanings (USER_MANUAL.md, section 2).

## 6. Compressors and motors

- **Restart delay.** The stabiliser's restart delay (about 8.5 s) protects against a restart
  storm, but not enough for a refrigeration compressor. A fridge or freezer without its own
  restart protection needs a 3-minute restart-delay relay at its socket.
- **Tap-change gap.** At each tap change the load sees a gap of about 90 ms. A running motor
  reaccelerates after it; check that a motor's own protection does not trip on it.
- **Starting current.** The motor's starting current must stay within the stabiliser's rating:
  count about three times the running power.

## 7. Before handing over

Commissioning (COMMISSIONING.md), including the calibration of both sense circuits.
