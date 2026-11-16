# Surge protection (P5): installation guide

For the qualified electrician who installs the protection. Two installations: the **mains
house** (TN-C-S, single phase) and the **PV side** of a house with the 48 V MPPT charger (P6).
The values here are the ones the simulation verified (`app/ui/tests/surge.test.ts`; design notes
in `docs/inc3/POWER.md`, section P5). Follow DEHN's installation instructions where they are
stricter.

> Work only on isolated circuits: the supply isolated and locked off, proved dead. On the PV side
> the array is live whenever light falls on it: open the charger's PV isolator, and cover the
> array or work at night before you open a DC connection.

## 1. Rules for every SPD

- **Short leads.** The voltage at the protected equipment is the SPD's Up plus the voltage of
  its leads (about 1 kV per metre at the rated surge). Keep the line (or N) lead plus the PE lead
  of each SPD at **0.5 m or less** in all; where the terminals allow it, wire in "V" (the incoming
  conductor into one terminal of the SPD and out of the other). The simulation shows why: with
  1 m leads the main board reaches 8.9 kV and the sub-board 5.7 kV at the type 1+2's rated
  lightning current, against 5.3 and 2.6 kV with 0.5 m.
- **Conductor sizes (copper):** type 1+2 SPD to PE ≥ **16 mm²**; type 2 SPD to PE ≥ **6 mm²**;
  the PV SPDs to PE ≥ **6 mm²**.
- **Straight runs.** No loops, no protected and unprotected conductors in one bundle after the
  SPD.
- **Earthing.** One main earthing terminal (MET) per building. Every service that enters the
  building (mains, PV, data, water, gas) is bonded at it, so lightning current does not lift one
  service against another.
- **RCDs.** Install the SPDs **upstream of any RCD**. Where an SPD has to sit downstream of an
  RCD, use an S-type (time-delayed, surge-current-proof) RCD; otherwise every surge the SPD takes
  to PE trips it.
- **Short-circuit rating.** Check the prospective short-circuit current at each SPD against its
  rating: the DEHNrail 6 kA with its 25 A gG (or B 25) backup; the type 2 25 kA; the DEHNshield's
  follow-current extinguishing capability 25 kA.

## 2. Mains house (TN-C-S, single phase)

| Where | SPD (DEHN) | Connection |
|---|---|---|
| Main board, at the PEN split | **DEHNshield TN 255 FM, 941205**: type 1+2, spark gaps L–PE and N–PE, prewired (not pluggable); Uc 255 V, Iimp 12.5 kA (10/350 µs) per pole, Up ≤ 1.5 kV, follow-current limitation (a 32 A gG fuse does not trip), indicator flag, remote contact; 2 DIN modules | L and N to the SPD, its PE terminal to the MET with 16 mm²; a 160 A gG backup fuse in its branch only if the upstream fuse is above 160 A gG |
| Sub-board, 10 m on (10 mm² feeder) | **DEHNguard MP TN ACI 275 FM, 942220**: type 2 for TN systems, L–PE varistor with series spark gap (ACI: no leakage current), N–PE spark gap; Uc 275 V, In 20 kA, Up ≤ 1.5 kV, pluggable, remote contact; 2 DIN modules | L and N to the SPD, its PE terminal to the board's PE bar with ≥ 6 mm²; no backup fuse needed (ISCCR 25 kA); terminals take ≤ 10 mm². (In a TT installation the 1+1 version 942121 instead.) |
| Final circuit of sensitive equipment, 15 m further (2.5 mm²) | **DEHNrail M 2P 255, 953200**: type 3, L–N varistor, N–PE spark gap; Uc 255 V, In 3 kA, Uoc 6 kV, Up ≤ 1.25 kV L–N, ≤ 1.5 kV L/N–PE, 25 A, pluggable; 1 DIN module | **V-wired**: L and N of the final circuit into the SPD's input terminals and out of its output terminals to the outlets (25 A at most), in a small DIN-rail enclosure at the outlets; PE to the PE bar (lead ≤ 0.3 m); backup 25 A gG or a B 25 breaker (ISCCR 6 kA); terminals take ≤ 4 mm² solid / 2.5 mm² flexible |

1. **Earth electrode:** ≤ 10 Ω (measured, COMMISSIONING.md 1.3). The incoming PEN lands on a
   16 mm² feed-through DIN-rail terminal (PT 16 N: insulated from the rail, so the rail does not
   carry PEN current) and from it on the MET bar, where it splits into N and PE; from there N
   and PE stay separate.
2. **Type 1+2 at the main board:** directly at the PEN split, leads ≤ 0.5 m in total per path.
3. **Type 2 in the sub-board,** at the board's incoming terminals. The 10 m of cable between the
   main board and the sub-board is the length the coordination was simulated with; DEHN also
   states the DEHNshield energy-coordinated with its type 2 and type 3 arresters.
4. **Type 3** in the final circuit of sensitive and valuable equipment (computers, TV, router),
   simulated 15 m after the type 2. Without it a 6 kV surge at the socket reaches the appliance at
   5.7 kV. Ordinary appliances on circuits without a type 3 are protected by the type 2 to about
   category II (2.5 kV); in the worst case simulated (the type 1+2 at its full lightning current)
   the sub-board busbar reaches 2.6 kV.
5. **Remote contacts** of the DEHNshield and the type 2 (changeover, 250 V / 0.5 A AC): to an
   indicator lamp or an input of a building controller, wired so the signal is **on while the SPD
   is healthy** (a broken wire then also shows).

## 3. PV side (D49)

The charger's array (9 × 410 Wp: 3 in series, 3 strings; 112 V open circuit, 127 V at −10 °C,
42 A short circuit) and 25 m of DC cable to the charger.

| Item | Specification |
|---|---|
| DC cable | 2 × 16 mm² PV cable (H1Z2Z2-K), 25 m; 2.3 % drop at the MPP |
| Bonding conductor | 6 mm² green-yellow, beside the DC cable for its whole length, from the array frame through the junction box to the charger's PV enclosure, the battery negative's PE connection and the MET |
| Battery negative | **bonded to PE** (the inverters bond it with their output's N): the array is then functionally earthed while the charger runs. Its earth-fault detection is a P6 change (open) |
| Array junction box | IP65 enclosure with a 35 mm DIN rail (the SPD is IP20, indoor only) |
| SPD in the junction box | **DEHN DEHNguard M YPV SCI 150 FM, 952518**: type 2 PV SPD (IEC 61643-31), UCPV 150 V DC, In 10 kA, Up ≤ 0.8 kV, Y circuit, SCI disconnector, status window, remote signalling contact |
| Charger's PV enclosure | DIN rail: **DEHN DEHNguard M YPV SCI 150, 952513** (as above, without the remote contact), then **two 68 µH air-core decoupling chokes**, one in DC+ and one in DC−, between the SPD and the charger's 2-pole PV isolator |
| Chokes | made to specification: 68 µH ±10 %, 52 A DC continuous, ≥ 500 A peak (air core: no saturation), ≤ 6 mΩ (a Brooks coil of about 24 turns of 35 mm² flexible copper, about 10.5 m, 92 mm former, 46 × 46 mm winding; about 8 W each at the MPP; insulated for 1 kV DC); mounted at least one coil diameter apart or at right angles to each other |
| PV isolator | 2-pole DC isolator (DC+ and DC−): DC− is connected to the battery negative and so to PE inside the charger |
| Signal cable | 2 × 1.5 mm², beside the DC cable, from the remote contact of 952518 to an indicator lamp beside the charger |

Why two SPDs: the cable is longer than 10 m, so IEC 60364-7-712 asks for an SPD at both ends.
Why the chokes: the SPDs' protection level (up to 0.8 kV) is far above what the charger
withstands (200 V MOSFETs). The chokes make the SPD take a surge that enters at either end of the
cable and limit what reaches the charger; without them a 5 kA surge at the charger's end already
destroys its input. With them, the charger's input stays below 170 V for 20 kA at either end,
charger running or stopped.

1. **Junction box:** DIN rail; 952518 in the middle. DC+ and DC− from the strings to the SPD's
   DC+ and DC− terminals (they are a Y: the polarity does not matter to the SPD, but keep it
   marked); the SPD's PE terminal to the box's PE bar with 6 mm², and the bar to the array frame
   and to the bonding conductor. Leads ≤ 0.5 m in total per path.
2. **Remote contact** (changeover; 250 V / 0.5 A AC, 125 V / 0.2 A DC; ≤ 1.5 mm²): wire it so the
   lamp beside the charger is **on while the SPD is healthy** and off when it has disconnected or
   the module is pulled; then a broken signal cable also shows as a fault. Use a 12 or 24 V lamp
   from a separate supply; no mains in the junction box.
3. **Charger's PV enclosure:** the DC cable to 952513 (DC+ / DC−, PE with 6 mm² to the PE bar and
   on to the charger's PE and the MET), then the two chokes, then the 2-pole PV isolator and the
   charger. Keep the cable from the SPD to the chokes short; do not run the charger-side wiring
   past the cable-side wiring.
4. **No backup fuse** for the PV SPDs: their short-circuit rating ISCPV (10 kA) is far above what
   the array can deliver (42 A).
5. **Polarity and voltage** at the array side of the isolator before closing it:
   COMMISSIONING.md section 3.

## 4. What the installation does not cover

- An external lightning protection system (air terminals, down conductors). A direct strike on
  the building needs one; with one, the type 1 SPDs are sized to its class, and a PV array on the
  roof needs separation distances or a type 1 PV SPD. Simulated for information without it: the
  sensitive equipment stays below 2.5 kV, not below 1.5 kV.
- Data and telephone lines: they need their own SPDs at the MET.
- The modules' rated impulse voltage: with its leads the array's DC+ reaches 1.5–2.3 kV against
  its frame at 10–20 kA; check it against the chosen modules' data sheet.
