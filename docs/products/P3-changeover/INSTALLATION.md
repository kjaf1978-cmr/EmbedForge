# Mains / back-up change-over (P3): installation guide

For the electrician who connects the unit to an installation (IEC 60364, or the national
equivalent: it takes precedence). Read USER_MANUAL.md (safety) first.

## 1. Where it goes

The unit sits between the meter or main switch (mains side), the back-up source, and the
distribution board of the circuits to be backed up (load side).

```
grid ── main switch / meter ── [type 2 SPD] ── X1/X2 (mains in)
                                                   change-over ── X3/X4 load ── RCD(s) ── circuits
back-up source (generator / inverter) ─────────── X5/X7 (back-up in)
```

The terminal references are those of the 1P unit. For the 3P+N unit, see the schematic and
`panel.csv`.

## 2. Earthing of the back-up source (important)

The unit switches the neutral together with the phases, so on back-up the load's neutral is the
back-up source's neutral. The back-up source must therefore have its own N–PE bond:

- **Generator:** N bonded to PE at the generator, or at its output terminal box, as the
  generator's manual allows. The generator frame is connected to the installation's PE.
- **Inverter:** follow its manual. Many inverters close an internal N–PE relay in off-grid mode;
  it must be enabled.

Without this bond, on back-up the load floats against earth. A first insulation fault is then
not disconnected, and the RCDs see no fault current.

## 3. RCDs and protection

- **RCDs:** on the load side, after the change-over, so they protect the circuits on both
  sources. Use 30 mA type A (or as the national rules require) for socket and bathroom circuits.
  An RCD on the mains feed alone protects nothing while the load is on back-up.
- **Short circuits:** each source enters through a C32 breaker with 6 kA breaking capacity. The
  prospective short-circuit current at the unit's mains terminals must not exceed 6 kA. Above
  that, an upstream back-up fuse is needed, per the breaker maker's coordination table. A
  generator's short-circuit current is far below this.
- **Upstream protection:** the supply conductors to X1/X2 and X5/X7 are 6 mm² and protected by
  the unit's C32 breakers against overload. The cable from the meter, and the cable from the
  generator, must be protected at their source end according to their size.
- **Overvoltage:** the unit's varistors limit surges between L and N. The installation needs a
  type 2 SPD at the main board, between all conductors and PE (see P5).

## 4. Cables and enclosure

- **Cables:** at least 6 mm² copper for 32 A (shorter runs, normal ambient). PE has the same
  size as the phase conductors.
- **Cable glands:** sized for the cables used (for example M25 for a 5 × 6 mm² cable). Seal the
  unused openings; keep IP54.
- **Enclosure:**
  - A metal enclosure, and its door, is connected to PE.
  - Leave the vent membrane free.
  - Mount the unit vertically, with the glands at the bottom.
- **Heat:** at 32 A the panel dissipates in the order of 10–20 W (breaker and contactor pole
  losses, the coil, the board). Choose an enclosure that keeps the inside below the devices'
  rated ambient. Prototype type test TT-1 confirms this.
- **Tightening torques:** each device's own value, printed on it and in its data sheet (ABB
  S201/S204, Schneider TeSys D, Phoenix PT push-in blocks need none). Mark every screw after
  tightening.

## 5. Back-up source size

The back-up source must deliver the load's current, including motor starting. The unit is rated
32 A AC-1 (resistive and mixed loads). For larger motors (compressors, pumps) check the
contactor's AC-3 rating against the motor's current.

## 6. Before handing over

Commissioning (COMMISSIONING.md), including the calibration of the sense (step 2.4).
