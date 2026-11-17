# P4b (contactor taps, D58): independent review and resolutions

Review of 16 November 2026, by an independent reviewer who had the circuit
(`app/ui/src/eda/stabiliserT.ts`), its models, its tests and these documents, but not the
designer's conclusions. 2 blockers, 7 major and 6 minor findings. The thyristor design reviewed
before it (3 blockers) was replaced by D58; that review is recorded in docs/inc3/POWER.md.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | A tap contactor could close onto the live winding: a coil driver failing short (or a decoder output stuck high) while K10 is closed pulls in a second tap at once; the match check only acts after its 15 ms filter and K10's opening, breaking a fault current | **Seal-in:** each tap coil is fed from K10's second NC auxiliary (live only while K10 is open) through a diode, or from 24 V through its own NO: a tap contactor can pull in only while K10 is open. Test: "the coil driver of K1 shorts while running on tap 5" (K1 gets no coil voltage; the unit carries on) |
| 2 | Blocker | The weld check relied on NO auxiliaries; only the NC is a mirror contact (IEC 60947-4-1 Annex F): a welded tap whose NO opens all the same would pass the check | **Mirror chain:** K10's coil runs through the NC (mirror) auxiliaries of all seven tap contactors in series, each bridged by a MOSFET for the commanded tap only. Test: "K5 welded and its NO auxiliary open all the same" (K10 stays open). The match check (NO) stays for "the commanded one is closed" and "two commanded" |
| 3 | Major | The change timer could release K10 before the latch was clocked if K10 opened slower than 46 ms; the change was then aborted | The timer charges only through K10's NC auxiliary: it starts once K10 is open, so the clock and the release always follow K10's opening; 10M keeps it up while K10 is closed. A welded K10 never clocks a change (safe) |
| 4 | Major | A latent failure of the match window (an open resistor, a comparator) fails towards "pass" | The mirror chain (2) is independent of it; the commissioning and the yearly check now prove both directions (COMMISSIONING.md 5.6–5.8) |
| 5 | Major | The match level follows the 24 V rail, the window the 12 V rail: a sagging 24 V passed "one beside it" | The window is taken from the 24 V rail (26.1k, 1.74k, 4.22k): levels and window scale together |
| 6 | Major | Tap hunting on weak lines: during the gap the sense saw the unloaded input | The sense is held (2N7000 in its filter path) from the change until about 1 s after K10 recloses, through K10's spare NO (never at power-up). Test: "15 kVA on a weak line (0.3 Ω)" |
| 7 | Major | K10's duty is not AC-1 (it energises the transformer at a random phase), inrush unverified | Q1 is now D-curve (10–20 × In); the transformer specification limits its inrush; K10's life and the reclose current are measured in TT-4 and TT-9. Open for the prototype |
| 8 | Major (suspicion) | The LC1D115BD may have an electronic coil with a large pull-in power the 96 W supply cannot give | Open: to be checked on the data sheet before ordering (ASSEMBLY.md section 1); if so, a 240 W supply (HLG-240H-24) for the 15 kVA unit |
| 9 | Major | BZX85C24 suppressors over-stressed (about 0.4 J per turn-off) | 1500 W TVS 1.5KE27A on every coil |
| 10 | Minor | Auxiliary contacts at very low current | CLK's loop loaded to 5 mA (2.2k); the tap NOs carry 5.5 mA; the auxiliary blocks LADN11 (gold-plated LADN11P where the maker's minimum is not met) |
| 11 | Minor | CLK floating through an off-board loop | 1 ms RC on CLK; the timer's charge also through the same NC |
| 12 | Minor | 24 V loss drops a tap with K10; LED reverse voltage; snubber capacitor class; backfeeding sources on the output | LED anti-parallel diodes; the snubber an X2 capacitor; INSTALLATION.md forbids backfeeding sources on the output; the 24 V loss is in DFMEA ST-8 (K10 and the tap drop together: one break of the input current by the tap contactor, within its AC-1 rating; type test TT-3) |
| 13 | Minor | Commissioning did not prove the dangerous direction | COMMISSIONING.md 5.6–5.8: none seen closed, one beside it (13-14 of another tap bridged), the mirror chain (21-22 of another tap opened), and each tap's 2-4-6 continuity to its own tap only |
| 14 | Minor | Document inconsistencies (trimmer pre-set, the gap, ST-14 and ST-3 wording, "logic-level") | Corrected |

Verified by simulation after the fixes: `tests/stabiliserT.test.ts` with LONG=1 (TEST results in
the package's `7-simulation-tests/`).
