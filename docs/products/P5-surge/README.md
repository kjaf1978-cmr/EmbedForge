# P5: surge and lightning protection of an installation

Worked example product of EmbedForge (NETApps Electric Simulation): an installation design, not
a board. Coordinated surge protective devices (SPDs) for a mains house (TN-C-S, single phase:
type 1+2 at the main board, type 2 in the sub-board, type 3 at the sockets of sensitive
equipment) and for the DC side of a house with the 48 V MPPT charger (P6): a certified type 2 PV
SPD at the array and at the charger (D49), with decoupling chokes before the charger. All
SPDs are DEHN products. Verified by simulation with the surges of the standards (10/350 µs,
8/20 µs, 1.2/50 µs). **Reviewed** (16 November 2026, `REVIEW.md`) and **signed off** (17 November 2026, D61);
two changes are required in P6.

Design notes: `docs/inc3/POWER.md`, section P5. DFMEA: `docs/inc3/DFMEA.md`, section 3c.
Simulation: `app/ui/src/eda/surge.ts`, `app/ui/tests/surge.test.ts`; results in
`docs/inc2/TEST_REPORT.md`, sections 3n to 3n.3.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | The two installations as circuit diagrams (`mainsHouse`, `pvHouse`); ERC clean; readable (tested). No board. PDF/SVG rendered for the package. |
| 2 | DFMEA verified by simulation | `tests/surge.test.ts`, 28 of 28 pass (TEST_REPORT 3n.3). Mains: four surges plus sensitivity runs, the sensitive equipment below 1.5 kV, sub-board below 4 kV, main board below 6 kV, every SPD within its ratings. PV: surges at both ends of the cable with the charger running and stopped, the charger's input at most 167 V, QPV at most 162 V. DFMEA 3c: SP-8 and SP-10 open as P6 changes. |
| 3 | Firmware | None. |
| 4 | Board | None: DIN-rail devices in the distribution boards and the PV enclosures. |
| 5 | Costed parts list | At DEHN list prices (EUR, without VAT) and estimates: mains **€874.50** (941205 €473.90, 942220 €260.10, 953200 €138.30, PEN feed-through terminal €2.20 estimate); PV **€964.00** (952518 €391.10, 952513 €332.90, two 68 µH chokes made to specification, €120 each estimate). Cables, enclosures and earthing are the electrician's installation material. |
| 6 | Documents | Installation guide, commissioning procedure with record sheet, user manual with maintenance and FAQ, review with resolutions (this folder); design notes (POWER.md P5), DFMEA (3c), and the design document of each installation (PDF, Word). |
| 7 | Independent review | Done 16 November 2026: 2 blockers, 8 major, 10 minor findings, all resolved or listed as open (`REVIEW.md`). |
| 8 | Package and sign-off | Signed off 17 November 2026 (D61, package 037f847). |

## Open

1. **P6 changes** required by P5 (DFMEA SP-8, SP-10): a 47 µF / 250 V film capacitor across QPV
   and QPV2; earth-fault detection of the functionally earthed array. To be built into P6's
   circuit and board when P6 is taken through the definition of done.
2. **Against DEHN's PDFs and instructions** (their download host is blocked here): the data
   sheets' page references (952513, 952518, 941205, 942220, 953200); the DEHNshield's terminal
   marking and that it is not pluggable; the DEHNrail's circuit (its N–PE gap modelled at a
   derived 1 kV); the DEHNshield's arc voltage (400 V, an assumption standing for its
   follow-current limitation).
3. The PV modules' rated impulse voltage against 2.3 kV at their frame.

## Folders (package)

| Folder | Contents |
|---|---|
| `1-schematics/` | The two installations' circuit diagrams (PDF, SVG) |
| `2-design-document/` | The design document of each installation (PDF, Word) |
| `4-parts-list/` | The costed parts list of each installation (CSV) |
| `5-documentation/` | Installation guide, commissioning, user manual, DFMEA (Markdown and PDF) |
| `6-app-project/` | The app's project files |
| `7-simulation-tests/` | The tests that verify the installations by simulation, and their result |
| `8-review/` | The independent review with its resolutions |

There is no `3-pcb/`: the product is DIN-rail devices, not a board.
