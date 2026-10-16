# Phase 0 status

Baseline: docs/requirements/EmbedForge_prompt_v3.8.md · Phase 0 is read-only (no application
code).

| Item | Deliverable | Status | Evidence / file |
|---|---|---|---|
| (a) | Licence analysis (linked / aggregated) | **Draft delivered**; UNVERIFIED items listed | phase0/a_licence_analysis.md |
| (b) | x86-64 and arm64 build confirmation | Partial: official-binary availability in (a); builds need CI | phase0/a_licence_analysis.md |
| (c) | LLM model profiles + benchmark | **Harness delivered and self-tested (7/7)**; 7 model repos confirmed. **Runs by you** on Profile A and B | phase0/c_llm_benchmark_plan.md, spikes/c/ |
| (d) | Kit inventory + initial catalogue | **Draft inventory delivered** (10 kits, 81 kit parts + 6 boards). ELEGOO contents UNVERIFIED (packing lists are images). Catalogue follows | phase0/d_kit_inventory.md, .csv |
| (e) | Code, symbol, footprint, datasheet sets | **Draft delivered** | phase0/e_curated_sets.md |
| (f) | Default fabrication profile | **Draft delivered** (EF-PROTO-STD v1.0.0) | phase0/f_fab_profile.md |
| (g) | Installer and installed size per OS | **Draft delivered** (estimates; clean-image measurement needs CI) | phase0/g_installer_sizes.md |
| (h) | PERF / VAPP-06 thresholds, DATA-04 part limit | **Assessed; measurement methods fixed**; ACC-02 BOM 43 parts > 40 (F0-23) | phase0/h_perf_thresholds.md |
| (i) | UI wireframes UI-01..23 | **Draft delivered** (23/23 IDs; checked at 1920, 1366 and 390 px) | phase0/i_wireframes.html |
| (j) | Draft VAPP-06 corpus | **Draft delivered**: 45 prompts, 148 tagged questions; tools/check_corpus.py PASS (11/11 boards, 9/9 NL-02 types, 45/45 EM-03 parts) | phase0/j_vapp06_corpus.yaml |
| (k) | Risk register | **v0.2.0 delivered** (36 risks, 10 high) | phase0/k_risk_register.md |
| (l) | Block-template library plan | **Draft delivered**: ~65 templates, package format, 12-check qualification suite, ACC coverage | phase0/l_template_plan.md |
| (m) | RP2040/RP2350 emulator evaluation + Pi virtual-clock spike | **Draft delivered**; measured in the container, not Profile A | phase0/m_emulator_evaluation.md, spikes/m/ |
| (n) | Active equivalents | Kit parts added: MFRC522 → PN5180, PCF8591 → ADS1115 + MCP4725, BMP180 → BME280. MPR121 excluded (D12). BMP280 active. Still open: GY-87 magnetometer | phase0/n_active_equivalents.md |
| (o) | Catalogue data sources and terms | **Draft delivered** | phase0/o_catalogue_sources.md |

**Phase 0 approved on 2026-10-05, with the gate-report conditions.** You replied "Please continue from here" to the approval request. Increment 1 has started (docs/inc1/).

Actions for you:
- Register the self-hosted runners (Profile A PC with label `profile-a`, Pi 5) when convenient;
  release media and VAPP-06 need them.
- Request CH341SER redistribution permission from WCH (F0-02).
- Ask Raspberry Pi Ltd about Pi OS image redistribution (F0-03).
- Run the LLM benchmark (spikes/c/README.md) on the Profile A PC and the Pi 5, and send me the results archives.
- Approve, or comment on, the Phase 0 gate report (phase0/phase0_gate_report.md).
- Confirm or correct the frozen kit list in d_kit_inventory.md section 1.
- If you own any of the three ELEGOO kits, send photos of their packing lists so the unverified contents can be confirmed.

## Decisions
| ID | Date | Decision |
|---|---|---|
| D1–D8 | before v3 | Applied in v3 (section 25). |
| D9 | 2026-09-26 | Accept all v3 review resolutions → v3.1 (section 26). |
| D10 | 2026-09-26 | Accept C3-11, F3-06, R-11 spike → v3.2 (section 27). |
| D11 | 2026-09-26 | Accept F0-01..F0-11 → v3.3 (section 28). |
| D16 | 2026-10-05 | F1-01, option A: privileged-helper function (d) restores signed files of the installed version from the recovery store, so start-up repair works on system-wide installations → v3.8 (section 33). |
| D17 | 2026-10-13 | Owner feedback on 0.1.0 (U-02): design tools first. Schematic entry and circuit simulation become Increment 2, PCB layout and routing Increment 3; UI-08 detailed, UI-24, ED-08, ED-09, SIM-01..05 added → v3.9 (section 34). |
| D18 | 2026-10-13 | Owner: the product is renamed **NETApps Electric Simulation** (short: NETApps), with its own logo. Every name the user sees changes (window, installer file, Start menu, Programs and Features, start screen, help, signing kit); the projects folder becomes Documents/NETApps Projects and the old folder is moved. Internal identifiers stay (install folder, registry key, app data ID, program file names, repository), so updates install over earlier versions. Builder's note to the owner: the name is close to the NetApp, Inc. trademark; check it before a public release. |
| D20 | 2026-10-14 | Owner: (1) parts shall carry the ratings of purchasable parts (E-series values, standard power and voltage ratings); (2) new parts: contactors, circuit breakers, solar (PV) modules, surge arresters, and phase monitoring, phase change-over (1-phase and 3-phase + N) and mains voltage stabiliser circuits; (3) worked, verified examples designed from scratch from basic catalogue components (no manufactured end products): DC-to-AC inverters 12/24/48 V to 230 V single-phase or 3 × 230/400 V, 5–30 kW, parallelable; solar battery chargers for 5–30 kWh batteries, parallelable; mains change-over and protection against over/undervoltage and phase asymmetry (1P and 3P+N); lightning and surge protection of a mains-connected house compared with a solar house. Schematics and simulation first; their PCB layouts with the Increment 3 tools. Plan: docs/inc3/POWER.md. |
| D21 | 2026-10-15 | Owner: the power track order changes to: P6 solar battery charger (MPPT) and P7 inverters before P5 surge protection ("Move the MPPT chargers and the inverters ahead of the surge protection"). P3 (change-over) and P4 (stabiliser) are done. |
| D22 | 2026-10-15 | Owner: every design gets a DFMEA (overvoltage, undervoltage, short circuit, open circuit, over- and undertemperature and others; effects of each failure mode) whose failure modes are resolved by inherent design changes so that use is safe at all times; built-in diagnostics; a how-to and a searchable FAQ for maintenance and repair; reliability: MTBF of at least 5 years with only predetermined, planned maintenance; a PFMEA with recommendations for a stable, reproducible design and performance over the product life cycle. Applies to P3–P7 (existing designs reworked). |
| D23 | 2026-10-15 | Owner: research the root causes of defects and deficiencies of commonly available products of these categories (change-over switches, stabilisers, MPPT chargers, inverters, surge protection), including use in tropical environments (heat, humidity, condensation, insects, corrosion, unstable grids); include them as foreseeable failures in the DFMEA and mitigate them inherently in the designs. |
| D24 | 2026-10-15 | Owner: add worked designs (with DFMEA, tests, maintenance FAQ as D22): automatic irrigation with soil-moisture sensors and a configurable number of channels (up to 64); automatic water-pump control; borehole pump control from the tank level (start at minimum, stop at maximum) with overflow detection; electric grass/brush trimmer ("multisense": motor drive with its sensors and protections); block moulding machine (system and detailed circuit design). Order: after the inverters (P7) and surge protection (P5). Sequencing on a microcontroller board where it fits (irrigation, moulding machine; full simulation with the board emulation of Increment 4); sensors, drivers, power and protections as discrete circuits; pump and borehole control purely discrete. |
| D25 | 2026-10-15 | Owner: add to the backlog the detailed schematic of an electrically operated gate controller with infrared remote command (motor drive open/close, limit switches, obstacle and overcurrent protection, IR receiver and decoding), with DFMEA, tests and maintenance FAQ as D22. Part of P9. |
| D26 | 2026-10-16 | Owner: add to the backlog the full and detailed design of the electronics of a grinder machine with variable speed and high torque: motor drive with speed control from standstill to full speed and full torque at low speed (speed feedback, current limit), soft start, overload and stall protection, motor and drive over-temperature, emergency stop and restart interlock (no restart after a power cut without an operator action), with DFMEA, tests and maintenance FAQ as D22. Part of P9. Open for the owner when P9 starts: the kind of grinder (e.g. grain/maize mill, bench or angle grinder, meat grinder), the motor power and the supply (230 V single-phase, 400 V three-phase or battery); the motor type (universal, brushless DC or induction with an inverter) follows from these. |
| D27 | 2026-10-16 | Owner: add relay-switched-tap mains voltage stabiliser designs for loads up to 5 kVA, up to 10 kVA and up to 15 kVA (next to the 1 kVA example of P4), with DFMEA, tests and maintenance FAQ as D22. Step P4b, after the inverters (P7) and before surge protection (P5), so the order becomes P1–P4, P6, P7, P4b, P5, P9, P8; the owner may move it. Design note for the owner: at the lowest input (140 V) the input current is about 36 A, 71 A and 107 A; 12 V PCB relays cannot switch that, so the taps are switched by contactors (break-before-make, with a short interruption at each tap change) or by anti-parallel thyristors switched at current zero (no interruption, no contact wear); the choice is put to the owner with both variants' DFMEA when P4b starts. The autotransformer, input breaker, surge arresters and the output cut-off scale with the rating. |
| D28 | 2026-10-16 | Owner: the power designs are not implementable as drawn: parts placed with net labels on every pin and no wiring, some overlapping. Rework every design into a real, physically realisable circuit diagram, and check all designs for implementability. Builder's audit (16 October): the four power designs had 0 wires, 166–304 labels and 1–12 overlapping parts each; their 12/24 V control supplies were ideal sources; the mains neutral was the control ground; multi-unit ICs were counted as one IC per unit; ICs had no decoupling; some timing values were simulation values, not the product's; and every LED was red (wrong property). Done first, before P7: an automatic wiring step (checked against the netlist), screw terminals, IC packages, decoupling, real auxiliary supplies, mains N separate from the control ground (bonded to PE), product values in the drawing, test sources and loads drawn outside the product. The 1 kVA stabiliser is redone first as the pilot, for the owner's review; then the change-overs and the charger. |
| D29 | 2026-10-16 | Owner: for each design, a bill of materials in the app and an export (Word, PDF) with the project description, the full schematics (printable, scalable vector), the BOM as a structured table with procurement sources and prices, and all documentation and FAQs at the end. After D28 (the schematics must be right first). Prices are indicative (dated, with the distributor and order number) and must be checked when ordering. |
| D19 | 2026-10-14 | Owner: Increment 2 gate approved ("Approve, start Increment 3"), with 0.2.6 as the last Increment 2 release (its signing and the owner's own look at it follow). Increment 3 (PCB layout and routing) starts; its scope is docs/inc3/SCOPE.md. Increment 1 and 2 carry-overs stay open as conditions. |
| D15 | 2026-10-05 | Q-01 answered: keep GPL-3.0-or-later for non-commercial use, unless the licence limits implementation of the specification (then reported at the next gate) → v3.7 (section 32). |
| D14 | 2026-10-05 | Accept F0-21, F0-22, F0-24; F0-23 modified by you to 100 parts → v3.6 (section 31). |
| D13 | 2026-10-05 | Accept F0-12..F0-20 → v3.5 (section 30). |
| D12 | 2026-10-05 | Exclude discontinued kit parts with no successor (no active equivalent of the same function and interface) → v3.4 (section 29). Today: MPR121. You confirmed this reading on 2026-10-05 and declined the stricter "manufacturer-named successor" rule. |

## Open questions
| ID | Raised | Question |
|---|---|---|
| Q-01 | 2026-09-26 | You stated the app is for non-commercial use. GPL-3.0-or-later cannot carry a non-commercial restriction: §10 forbids imposing further restrictions, and §7 lets recipients remove them. Is this (1) your intended use only, keeping GPL-3.0-or-later (D5), or (2) a request to change the licence to a non-commercial one? A non-commercial licence would no longer be open source. It would reverse D5 and replace the §7 WebView2 permission (F0-01). It would not change the aggregated GPL tools, the datasheet and distributor-data restrictions, or the excluded research-only models. | **Answered by D15 (2026-10-05).**
