# P3 change-over: independent review and resolutions

The review was made on 15 November 2026 by a reviewer who had not taken part in the design. It
read the circuit source, the design notes, the DFMEA, the product documents, the boards' parts
and wiring lists, and the simulation tests. It worked out the thresholds and timings by hand,
and they agree with the documents: 2.21 V and 1.64 V for 253 V and 195 V, 10.4 s return delay,
0.47 s dead time. It found the NC interlock correctly drawn.

Every finding was checked against the sources, and each was resolved as below, in the design
and in the documents of this package.

## Blockers

| # | Finding | Resolution |
|---|---|---|
| B1 | The wiring list gave 1.5 mm² for nets that carry the 32 A circuits (the breaker-to-contactor wire shared a net with the board's feed). | **Fixed in the circuit.** Each board feed is now tapped through a 10 A gG 10 × 38 fuse on the DIN rail. The fused side is a net of its own, wired in 1.5 mm². The 32 A nets are 6 mm², the load side included. Wire sizes are in `panel.csv`. |
| B2 | Terminal numbering differed between the parts list, the circuit and the wiring list. | **Fixed.** The circuit and `panel.csv` already used the same references. The parts list listed the terminal functions in a different order from the references. Each function is now listed next to its reference (for example "X5 L back-up"). |
| B3 | The thresholds could not be guaranteed: the 1 VA sense transformer's no-load voltage varies from unit to unit and there was no adjustment. C7 (4.7 µF 35 V) was close to its rating. | **Fixed in the circuit.** Each sense divider is now 6.8k plus a 5k 25-turn trimmer, set at commissioning (SENSE = 2.000 V × U / 230 V; COMMISSIONING.md 2a). An open wiper raises SENSE and trips to back-up, so the failure is safe. The capacitor is now rated 50 V. The threshold tolerance is stated as the reference divider's worst case, ± 4 V. |

## Major

| # | Finding | Resolution |
|---|---|---|
| M1 | The interlock is electrical only; the claim about a welded contactor needs mirror contacts; the auxiliary terminal numbers are the symbol's. | **Fixed.** The maker's mechanical interlock is added to the panel, and the NC auxiliary contact is specified as a mirror contact (IEC 60947-4-1 Annex F) in DFMEA C-1, the user manual and the assembly guide. The assembly guide explains the block's own terminal marking. Type test TT-4 tests a welded contactor. Still to confirm with Schneider: that the LAD9V2 kit fits the 4-pole LC1DT32 frame (noted in ASSEMBLY.md). |
| M2 | The contactor rating was overstated: LC1DT32 is 32 A AC-1, while DFMEA C-10 said AC-3. | **Fixed.** DFMEA C-10, the user manual and the installation guide now state 32 A AC-1. Motor loads are to be checked against the contactor's AC-3 rating. |
| M3 | The board feeds were protected only by the C32 breaker; the board's 5 × 20 fuses break only about 35 A; the parts list did not state their characteristic. | **Fixed.** 10 A gG fuses with 100 kA breaking capacity now protect the board feeds (new DFMEA item C-16). The board fuses are listed as time-lag T 5 × 20, 35 A breaking. The catalogue no longer gives every small fuse the same Schurter part number. |
| M4 | The boards' KiCad project files were empty, so the mains clearance rule had no net class to act on; there was no rule between the two sources. | **Fixed.** The packaging script emptied every board's `.kicad_pro` (all 30 boards). The routing itself ran with the right classes; only the delivered project file was affected. The script is fixed and all 30 project files are regenerated. The change-over boards now have a separate class for each source, each kept 3.2 mm from everything else, so also from each other. Both boards were re-routed with this rule. |
| M5 | The 3P+N undervoltage step could not work: one phase alone trips on asymmetry first. | **Fixed.** In COMMISSIONING.md, the undervoltage step lowers all three phases together with a three-phase variac. The asymmetry steps lower one phase. The load is disconnected during the variac steps. |
| M6 | A 6 mm² PE wire to the board does not fit its connector. | **Fixed.** PE to the board is now 1.5 mm² green-yellow; 6 mm² stays between the PE blocks (`panel.csv`). |
| M7 | Installation information was missing: the generator's N–PE bond, RCD placement, short-circuit rating, upstream protection, enclosure bonding, torques, glands, heat. | **Added** as a new document, INSTALLATION.md. |

## Minor

| Finding | Resolution |
|---|---|
| POWER.md described the delay as "10k/4.7 µF" | Corrected: 2 × 750k / 10 µF film, and 1M / 680 nF film for the dead time. |
| The circuit's note named the window comparator "LM393" | Corrected to LM339. |
| "About 10 %" asymmetry was not measured | Stated as "about 10 … 13 %, between the 7 % that holds and the 12 % that trips in the simulation". A lost phase regenerated above that by motors is left to the motors' own protection (DFMEA C-4). |
| "Type 3" was not supported: the varistors are L–N only | DFMEA C-8 now says differential mode only, with L–PE covered by the installation's type 2 SPD (INSTALLATION.md). TT-7 tests L–PE as an insulation withstand. |
| Control-transformer headroom at 195 V | Verified by simulation. At 196 V the contactor stays closed (power.test "196 holds"), so the 24 V supply stays above the 20 V lockout with the coil load. |
| The 680 nF dead-time capacitors could be X7R | Values above 100 nF up to 1 µF are now catalogued as film (MKT). |
| The S204 was described as "3-pole + N" | It is now "Circuit breaker 4-pole (3P+N, N protected)". |
| TT-1 was at 35 A | It is now at the rated 32 A (IEC 61439-1). |
| Start-up behaviour and the return time | The user manual now says about 11 s (10.5 s + 0.47 s), and gives the behaviour at power-up. |
| The timing is verified only scaled in the simulation | TT-4 is named as its verification at full length (DFMEA C-1, C-6). |

## Open after the review

- Confirm the mechanical interlock kit for the LC1DT32 pair with Schneider.
- Confirm the TMOV14RP300E body size against Littelfuse's drawing. The board's footprint is drawn
  larger than the part.
- The prototype type tests (TYPE_TESTS.md) and certification are, by their nature, after a
  prototype exists.
