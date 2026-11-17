# Pump controller (P9): installation guide

For the electrician. National wiring rules take precedence. Read USER_MANUAL.md first. The
designators are those of the schematic, the board and the parts list.

## 1. Where it goes

```
supply ── RCD 30 mA ── breaker 16 A ── X1 L / X2 N / X3 PE ── controller ── X6 pump L / X8 pump N / X10 PE ── pump
                                                              X5 tank COM, X4 its return, X7 LOW, X9 HIGH, X11 OVERFLOW
                                                              X12 source COM, X14 its return, X13 DRY
```

- **Fixed wiring only,** in its own circuit. The motor-protective breaker Q1 and both contactors
  switch L and N (a reversed supply still disconnects the pump).
- **RCD.** A 30 mA RCD (type A) in front of the controller: borehole and transfer pumps are
  outdoors and in water.
- **Upstream protection.** A 16 A breaker for the circuit; Q1 protects the pump; the gG 2 A fuse F2
  protects the control circuit and the board's feed.
- **No other source on the pump side.**

## 2. Earthing and SELV

- **PE** runs through the PE stud in the enclosure: input PE (X3) → stud → pump PE (X10). The
  enclosure, its door and the DIN rail are bonded to the stud. The pump's metal parts, a metal tank
  and metal pipes are bonded to PE as the wiring rules require.
- **The control is SELV: do not connect it to PE** (the board has no PE terminal). Its electrodes
  then read correctly in a metal tank, a steel casing or with a galvanised rising main; an earthed
  control would short every rod through the earthed metal.
- **Keep the electrode wiring apart** from the mains wiring in the enclosure: its own gland, on the
  other side from the contactors and the breaker (at least 6 mm, or a barrier).
- **The borehole electrode cable** runs down the hole beside the pump cable: use a submersible,
  drinking-water-approved cable with insulation rated for the mains voltage (for example H07RN-F,
  or the pump maker's cable type), so the separation from the pump cable does not depend on
  spacing.

## 3. Cables and terminals

| Circuit | Size |
|---|---|
| L, N, PE in; pump L, N, PE | 2.5 mm² (copper, PVC); the pump cable for submersible use as the pump maker states |
| Board feed, contactor coils, relays (behind F2) | 1.5 mm² |
| Electrodes | a sheathed multi-core cable, 0.75 … 1.5 mm², one cable for the tank and one for the source; **each COM rod on two cores** (COM and COM return), joined only at the rod |

The power terminals X1, X2, X3, X6, X8, X10 are DIN-rail terminal blocks for 2.5 mm²; the electrode
terminals are on the board's control connector side (panel.csv).

## 4. The electrodes

- **Tank:** COM at the bottom (always under water), LOW at the start level, HIGH at the stop
  level, OVERFLOW just below the overflow pipe. Rods of stainless steel (AISI 316), held apart in an
  insulating head. The COM rod's two cores are joined at the rod, nowhere else.
- **Source:** COM at the bottom, DRY above the pump's intake (the pump must stop before it draws
  air); the COM rod on two cores as in the tank.
- **Long cables.** The electrodes read wet up to about 15 kΩ (the water and the cable together),
  and an open rod reads dry with up to about 10 nF between its core and the COM core (about
  70 … 100 m of ordinary multicore cable; type test TT-5 sets the limit for the cable used).

## 5. Settings

- Set Q1's thermal setting to the pump's rated current (its rating plate), and wire it for single
  phase as the maker shows (every pole carrying current).
- No other settings.

## 6. Before handing over

Commissioning (COMMISSIONING.md).
