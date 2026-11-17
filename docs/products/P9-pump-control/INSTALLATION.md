# Pump controller (P9): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first.

## 1. Where it goes

```
supply ── RCD 30 mA ── breaker (upstream) ── X1 L / X2 N / X3 PE ── controller ── X4 pump L / X5 pump N / X6 PE ── pump
                                                                     X7 … X10 tank electrodes, X11 … X12 source electrodes
```

- **Fixed wiring only,** in its own circuit. The motor-protective breaker QF1 switches L and N; the
  contactor switches L and N (a reversed supply still disconnects the pump).
- **RCD.** A 30 mA RCD (type A) in front of the controller: borehole and transfer pumps are
  outdoors and in water.
- **Upstream protection.** A 16 A breaker for the circuit is enough for a 1.5 kW pump; QF1 protects
  the pump.

## 2. Earthing and PELV

- **PE** runs through the PE stud in the enclosure: input PE (X3) → stud → pump PE (X6). The
  enclosure, its door and the DIN rail are bonded to the stud. The board's control ground is
  bonded to the stud by one conductor (XPE): the control is PELV.
- **Keep the electrode wiring apart** from the mains wiring: its own cable, its own gland, and in
  the enclosure on the other side from the contactor and the breaker (at least 6 mm, or a barrier).
  The electrode cable is extra-low voltage but must not touch mains conductors.
- **The pump's metal parts and a metal tank** are bonded to PE as the wiring rules require.

## 3. Cables and terminals

| Circuit | Size |
|---|---|
| L, N, PE in; pump L, N, PE | 2.5 mm² (copper, PVC); the pump cable for submersible use as the pump maker states |
| Board feed (L, N behind the board's fuse) | 1.5 mm² |
| Contactor coil circuit (behind its 2 A gG fuse), relays | 1.5 mm² |
| Electrodes | a sheathed multi-core cable, 0.75 … 1.5 mm², one cable for the tank and one for the source |

The power terminals X1 … X6 are DIN-rail terminal blocks for 2.5 mm²; the electrode terminals
X7 … X12 are on the board.

## 4. The electrodes

- **Tank:** COM at the bottom (always under water), LOW at the start level, HIGH at the stop
  level, OVERFLOW just below the overflow pipe. Rods of stainless steel (AISI 316), held apart in an
  insulating head.
- **Source:** COM at the bottom, DRY above the pump's intake (the pump must stop before it draws
  air).
- **Long cables.** The electrode reads wet up to about 25 kΩ (the water and the cable together).
  Very long cables (more than about 100 m) and their capacitance are checked in type test TT-5.

## 5. Settings

- Set QF1's thermal setting to the pump's rated current (its rating plate).
- No other settings.

## 6. Before handing over

Commissioning (COMMISSIONING.md).
