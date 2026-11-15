# Surge protection (P5): installation guide

For the qualified electrician who installs the protection. Two installations: the **mains
house** (TN-C-S, single phase) and the **PV side** of a house with the 48 V MPPT charger (P6).
The values here are the ones the simulation verified (`app/ui/tests/surge.test.ts`; design notes
in `docs/inc3/POWER.md`, section P5). Follow the SPD makers' installation instructions where they
are stricter.

> Work only on isolated circuits: the supply isolated and locked off, proved dead. On the PV side
> the array is live whenever light falls on it: open the charger's PV isolator, and cover the
> array or work at night before you open a DC connection.

## 1. Rules for every SPD

- **Short connections.** The voltage at the protected equipment is the SPD's Up plus the voltage
  of its leads (about 1 kV per metre at the rated surge). Keep the line lead plus the PE lead of
  each SPD at **0.5 m or less**; where the terminals allow it, wire in "V" (the incoming conductor
  into one terminal of the SPD and out of the other).
- **Conductor sizes (copper):** type 1 (and type 1+2) SPD to PE ≥ **16 mm²**; type 2 SPD to PE
  ≥ **6 mm²**; the PV SPDs to PE ≥ **6 mm²**.
- **Straight runs.** No loops, no protected and unprotected conductors in one bundle after the
  SPD.
- **Earthing.** One main earthing terminal (MET) per building. Every service that enters the
  building (mains, PV, data, water, gas) is bonded at it, so lightning current does not lift one
  service against another (DFMEA SP-6).

## 2. Mains house (TN-C-S, single phase)

| Where | SPD | Connection |
|---|---|---|
| Main board, at the PEN split | Type 1+2, 255–275 V AC, Iimp 12.5 kA (10/350 µs), Up ≤ 1.5 kV, with status window and remote contact (product: open, see README) | L to PE (MET); backup fuse as the maker specifies |
| Sub-board, 10 m on (10 mm² feeder) | Type 2 "1+1": L–N varistor, N–PE spark gap; Uc 275 V, In 20 kA, Up ≤ 1.5 kV | L to PE, N to PE through the spark gap |
| Socket of sensitive equipment, 15 m further (2.5 mm²) | Type 3: Uc 255 V, Uoc 6 kV, L–N and L–PE varistors, N–PE spark gap | at the outlet or as a DIN-rail module in the final circuit |

1. **Earth electrode:** ≤ 10 Ω (measured, COMMISSIONING.md 1.3). The incoming PEN lands on a
   16 mm² DIN-rail terminal, then on the MET; from there N and PE stay separate.
2. **Type 1+2 at the main board:** directly at the PEN split, line and PE leads ≤ 0.5 m in total.
3. **Type 2 in the sub-board,** at the board's incoming terminals. The ≥ 10 m of cable between
   the main board and the sub-board is part of the coordination: if the sub-board is closer,
   ask for the coordination to be checked again.
4. **Type 3** only at sockets of sensitive equipment, at least 5 m of cable after the type 2.
   The simulation shows why: without it the 6 kV socket surge reaches the appliance at 5.75 kV.

## 3. PV side (D49)

The charger's array (9 × 410 Wp: 3 in series, 3 strings; 112 V open circuit, 127 V at −10 °C,
42 A short circuit) and 25 m of DC cable to the charger.

| Item | Specification |
|---|---|
| DC cable | 2 × 16 mm² PV cable (H1Z2Z2-K), 25 m; 2.3 % drop at the MPP |
| Bonding conductor | 6 mm² green-yellow, laid beside the DC cable for its whole length, from the array frame through the junction box to the charger's PE and the MET |
| Array junction box | IP65 enclosure with a 35 mm DIN rail (the SPD is IP20, indoor only) |
| SPD in the junction box | **DEHN DEHNguard M YPV SCI 150 FM, 952518**: type 2 PV SPD (IEC 61643-31), UCPV 150 V DC, In 10 kA, Up ≤ 0.8 kV, Y circuit, SCI disconnector, status window, remote signalling contact |
| SPD beside the charger | **DEHN DEHNguard M YPV SCI 150, 952513**: as above, without the remote contact |
| Signal cable | 2 × 1.5 mm², beside the DC cable, from the remote contact of 952518 to an indicator lamp beside the charger |

Why two SPDs: the cable is longer than 10 m, so IEC 60364-7-712 asks for an SPD at both ends.
The array's SPD protects the modules (without it 26 kV reach their frames in the simulation) and
the charger (303 V at its input without it, against its 200 V MOSFETs).

1. **Junction box:** DIN rail; 952518 in the middle. DC+ and DC− from the strings to the SPD's
   DC+ and DC− terminals (they are a Y: the polarity does not matter to the SPD, but keep it
   marked); the SPD's PE terminal to the box's PE bar with 6 mm², and the bar to the array frame
   and to the bonding conductor. Leads ≤ 0.5 m in total per path.
2. **Remote contact** (changeover; 250 V / 0.5 A AC, 125 V / 0.2 A DC; ≤ 1.5 mm²): wire it so the
   lamp beside the charger is **on while the SPD is healthy** and off when it has disconnected or
   the module is pulled; then a broken signal cable also shows as a fault. Use a 12 or 24 V
   lamp from a separate supply; no mains in the junction box.
3. **Beside the charger:** 952513 on a DIN rail in the charger's PV enclosure, before the PV
   isolator (array side), DC+ / DC− from the cable, PE with 6 mm² to the charger's PE and the MET.
4. **No backup fuse** for the PV SPDs: their short-circuit rating ISCPV (10 kA) is far above what
   the array can deliver (42 A).
5. **Polarity and voltage** at the charger's terminals before closing the PV isolator:
   COMMISSIONING.md section 3.

## 4. What the installation does not cover

- An external lightning protection system (air terminals, down conductors). With one, the
  type 1 SPDs are sized to its class, and a PV array on the roof needs separation distances or a
  type 1 PV SPD; that is outside P5.
- Data and telephone lines: they need their own SPDs at the MET.
