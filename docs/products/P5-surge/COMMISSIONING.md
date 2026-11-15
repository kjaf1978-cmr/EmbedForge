# Surge protection (P5): commissioning procedure

Done by a qualified electrician after installation (INSTALLATION.md), after any change to the
earthing or the SPDs, and after an SPD has been replaced. Record every result in section 5.

You need: an installation tester (insulation 500 V, low-resistance continuity), an earth
electrode tester (3- or 4-pole method, or a clamp tester), a DC voltmeter (CAT III, 1000 V),
and a 12 or 24 V lamp supply for the PV remote contact.

## 1. Earthing and bonding (both installations)

| Step | Check | Expected |
|---|---|---|
| 1.1 | Visual: SPD leads, conductor sizes (INSTALLATION.md section 1), V-wiring, no loops | as specified; line + PE lead of each SPD ≤ 0.5 m |
| 1.2 | Continuity: each SPD's PE terminal to the MET | low resistance (≤ 0.1 Ω plus the leads) |
| 1.3 | Earth electrode resistance, MET disconnected from the PEN for the test | ≤ 10 Ω |
| 1.4 | PV: continuity of the 6 mm² bonding conductor: array frame – junction box PE bar – charger PE – MET | low resistance (≤ 0.2 Ω plus the leads for 25 m) |

## 2. Mains house

| Step | Check | Expected |
|---|---|---|
| 2.1 | Status windows of the type 1+2, type 2 and type 3 SPDs | all "OK" (green) |
| 2.2 | Remote contact of the type 1+2 SPD, if wired: pull its module | the signal shows a fault; refit, signal back to OK |
| 2.3 | Insulation test of the installation (500 V DC) | **pull the SPDs' plug-in modules first** (they would conduct and could be damaged), refit them afterwards; ≥ 1 MΩ |
| 2.4 | Supply on: voltage L–N, L–PE, N–PE at the socket with the type 3 SPD | 230 V ± 10 %, 230 V ± 10 %, below 2 V |

## 3. PV side

Charger PV isolator open; do the insulation test (3.4) in low light, or with the array covered.

| Step | Check | Expected |
|---|---|---|
| 3.1 | Status windows of 952518 (junction box) and 952513 (charger) | both green |
| 3.2 | Indicator lamp beside the charger | on (SPD healthy) |
| 3.3 | Pull the protection module of 952518; refit it | lamp off while it is out (also a broken signal cable shows as a fault); on again after refitting |
| 3.4 | Insulation of the DC cable (IEC 62446-1): DC+ and DC− to PE, 500 V DC | **pull the protection modules of both SPDs first** (the base keeps the wiring), refit them afterwards; ≥ 1 MΩ |
| 3.5 | Voltage and polarity at the array side of the isolator | DC+ positive; open-circuit voltage 112 V at 25 °C cells (about 100 V on hot modules, up to 127 V at −10 °C), never above 150 V (the SPDs' UCPV) |
| 3.6 | Close the PV isolator, charger running | lamp still on, both windows green |

## 4. After a thunderstorm or a nearby strike (also in the user manual)

Steps 2.1, 3.1 and 3.2. A red window or a dark lamp: replace that protection module (the base
stays) and repeat 3.3 or 2.2.

## 5. Record sheet

| Installation: | Date: | Electrician: |
|---|---|---|

| Step | Measured / seen | OK |
|---|---|---|
| 1.1 lead lengths, sizes | | |
| 1.2 SPD PE to MET (Ω) | type 1+2: … type 2: … type 3: … PV box: … PV charger: … | |
| 1.3 earth electrode (Ω) | | |
| 1.4 PV bonding conductor (Ω) | | |
| 2.1 mains SPD windows | | |
| 2.2 remote contact, type 1+2 | | |
| 2.3 insulation (MΩ) | | |
| 2.4 L–N / L–PE / N–PE (V) | | |
| 3.1 PV SPD windows | | |
| 3.2 lamp on | | |
| 3.3 lamp off with module pulled | | |
| 3.4 DC insulation DC+ / DC− to PE (MΩ) | | |
| 3.5 Voc (V), polarity, cell temperature | | |
| 3.6 running: lamp, windows | | |
