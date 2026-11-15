# Mains voltage stabiliser 1 kVA (P4): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first.

## 1. Where it goes

```
socket circuit (≥ 16 A, with RCD) ── X2 L in / X4 N in / X5 PE ── stabiliser ── X6 L out / X7 N out / X8 PE ── appliance(s) ≤ 1 kVA
```

The stabiliser is a fixed appliance. It is connected either:

- by a plug to a 16 A socket circuit, if the national rules allow it for this current; or
- to its own circuit, protected by a 16 A breaker or fuse.

Its own C10 breaker (Q1, on the DIN rail inside) protects the unit's internal wiring and the
transformer.

## 2. Earthing and RCD

- **Earthing.** PE runs straight through: input PE (X5) → chassis and transformer core →
  output PE (X8). The control ground is bonded to PE (PELV).
- **RCD protection.** The stabiliser is an autotransformer, so the output is not separated from
  the input. An RCD in front of the stabiliser therefore protects its output circuits too: use
  30 mA type A in the circuit that feeds it.
- **Neutral.** Do not switch or break N on its own anywhere between the stabiliser and the
  grid.

## 3. Cables

- **Input and output:** 1.5 mm² copper (10 A), or 2.5 mm² if the circuit breaker in front is
  16 A. The board's terminals take up to 2.5 mm².
- **Inside the unit:**
  - breaker to board, and board to transformer taps: 1.5 mm² H07V-K with ferrules;
  - the thermal cut-out's leads to X1/X3: 0.75 mm².

## 4. Enclosure and heat

- **Mounting.** The transformer (1 kVA, about 8 … 10 kg) is bolted to the enclosure's base.
  Mount the unit upright on a wall or the floor, out of the sun, with 10 cm free above and on
  the sides for air.
- **Enclosure.** A metal enclosure is connected to PE, and so is its door or cover.
- **Heat.** The transformer's losses at full load, typically a few percent of 1 kVA, set the
  temperature rise. The thermal cut-out protects against overheating; TT-1 measures it.

## 5. Compressors and motors

- **Restart delay.** The stabiliser's restart delay (about 8 s) protects against a restart
  storm, but not enough for a refrigeration compressor. A fridge or freezer without its own
  restart protection needs a 3-minute restart-delay relay at its socket.
- **Starting current.** The motor's starting current must stay within the stabiliser's rating:
  count about three times the running power.

## 6. Before handing over

Commissioning (COMMISSIONING.md), including the calibration of both sense circuits.
