# Surge protection (P5): commissioning procedure

Done by a qualified electrician after installation (INSTALLATION.md), after any change to the
earthing or the SPDs, and after an SPD has been replaced. Record every result in section 5.

You need: an installation tester (insulation 250 and 500 V, low-resistance continuity), an earth
electrode tester (3- or 4-pole method), a DC voltmeter (CAT III, 1000 V), an LCR meter or the
choke maker's test report, and a 12 or 24 V lamp supply for the remote contacts.

## 1. Earthing and bonding (both installations)

| Step | Check | Expected |
|---|---|---|
| 1.1 | Visual: SPD leads, conductor sizes (INSTALLATION.md section 1), V-wiring, no loops; the PEN on its feed-through terminal and the MET bar | as specified; line + PE lead of each SPD ≤ 0.5 m |
| 1.2 | Continuity: each SPD's PE terminal to the MET | low resistance (≤ 0.1 Ω plus the leads) |
| 1.3 | Earth electrode resistance, **3- or 4-pole method only** (a clamp tester in TN-C-S measures through the PEN network, not the electrode). **Before the test:** supply isolated and locked off and proved dead; the electrode's link to the MET removed (where the link belongs to the network operator, under its rules). **After:** link refitted and tightened, its continuity checked (1.2), then the supply restored | ≤ 10 Ω |
| 1.4 | PV: continuity of the 6 mm² bonding conductor: array frame – junction box PE bar – charger's PV enclosure PE – MET; and the battery negative's PE connection | low resistance (≤ 0.2 Ω plus the leads for 25 m) |

## 2. Mains house

| Step | Check | Expected |
|---|---|---|
| 2.1 | Status windows of the type 2 and the type 3, indicator flag of the DEHNshield | all "OK" (green) |
| 2.2 | Remote contacts: type 2: pull its module and refit it; DEHNshield (prewired, not pluggable): check the contact's continuity in the healthy state against DEHN's terminal marking | the signal shows a fault while the type 2's module is out, OK again when refitted; the DEHNshield's contact in its healthy state |
| 2.3 | Insulation test of the installation | **pull the type 2's and type 3's plug-in modules first** (they would conduct and could be damaged) and refit them afterwards; the DEHNshield (prewired) disconnected for the test, or, where that is not practicable, the test at 250 V DC (IEC 60364-6); ≥ 1 MΩ |
| 2.4 | Supply on, **no load**: voltage L–N, L–PE, N–PE at the outlet behind the type 3 | 230 V ± 10 %, 230 V ± 10 %, below 2 V |

## 3. PV side

Charger PV isolator (2-pole) open; do the insulation test (3.5) in low light, or with the array
covered.

| Step | Check | Expected |
|---|---|---|
| 3.1 | Status windows of 952518 (junction box) and 952513 (charger's PV enclosure) | both green |
| 3.2 | Indicator lamp beside the charger | on (SPD healthy) |
| 3.3 | Pull the protection module of 952518; refit it | lamp off while it is out (also a broken signal cable shows as a fault); on again after refitting |
| 3.4 | Chokes: inductance (LCR meter at 1 kHz, or the maker's report) and DC resistance | 68 µH ± 10 % each; ≤ 6 mΩ each |
| 3.5 | Insulation of the DC cable (IEC 62446-1): DC+ and DC− to PE, 500 V DC | **pull the protection modules of both SPDs first** (the base keeps the wiring) and refit them afterwards; the PV isolator open (both poles: DC− is bonded to PE in the charger); ≥ 1 MΩ |
| 3.6 | Voltage and polarity at the array side of the isolator | DC+ positive; open-circuit voltage 112 V at 25 °C cells (about 100 V on hot modules, up to 127 V at −10 °C), never above 150 V (the SPDs' UCPV) |
| 3.7 | Close the PV isolator, charger running | lamp still on, both windows green |

## 4. After a thunderstorm or a nearby strike (also in the user manual)

Steps 2.1, 3.1 and 3.2. A red window or a dark lamp: replace that protection module (the base
stays) and repeat 3.3 or 2.2. A red flag on the DEHNshield: replace the whole device (it is
prewired, not pluggable) and repeat 2.2.

## 5. Record sheet

| Installation: | Date: | Electrician: |
|---|---|---|

| Step | Measured / seen | OK |
|---|---|---|
| 1.1 lead lengths, sizes, PEN terminal | | |
| 1.2 SPD PE to MET (Ω) | type 1+2: … type 2: … type 3: … PV box: … PV charger: … | |
| 1.3 earth electrode (Ω), method, link refitted | | |
| 1.4 PV bonding conductor, battery negative to PE (Ω) | | |
| 2.1 mains SPD windows, DEHNshield flag | | |
| 2.2 remote contacts (type 2, DEHNshield) | | |
| 2.3 insulation (MΩ), test voltage | | |
| 2.4 L–N / L–PE / N–PE, no load (V) | | |
| 3.1 PV SPD windows | | |
| 3.2 lamp on | | |
| 3.3 lamp off with module pulled | | |
| 3.4 chokes: µH, mΩ (DC+ / DC−) | | |
| 3.5 DC insulation DC+ / DC− to PE (MΩ) | | |
| 3.6 Voc (V), polarity, cell temperature | | |
| 3.7 running: lamp, windows | | |
