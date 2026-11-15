# P5: surge and lightning protection of an installation

Worked example product of EmbedForge (NETApps Electric Simulation): an installation design, not
a board. Coordinated surge protective devices (SPDs) for a mains house (TN-C-S, single phase:
type 1+2 at the main board, type 2 in the sub-board, type 3 at the sockets of sensitive
equipment) and for the DC side of a house with the 48 V MPPT charger (P6): a certified type 2 PV
SPD at the array and at the charger (D49). Verified by simulation with the surges of the
standards (10/350 µs, 8/20 µs, 1.2/50 µs). **In progress**; not yet reviewed or signed off.

Design notes: `docs/inc3/POWER.md`, section P5. DFMEA: `docs/inc3/DFMEA.md`, section 3c.
Simulation: `app/ui/src/eda/surge.ts`, `app/ui/tests/surge.test.ts`; results in
`docs/inc2/TEST_REPORT.md`, sections 3n and 3n.1.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | The two installations as circuit diagrams (`mainsHouse`, `pvHouse`); ERC clean (`tests/ercproducts.test.ts`). The PEN on a 16 mm² DIN-rail terminal. No board. PDF/SVG export for the package still to do. |
| 2 | DFMEA verified by simulation | `tests/surge.test.ts`, 10 of 10 pass on this commit. Mains: 12.5 kA 10/350 µs, 20 kA 8/20 µs and 6 kV / 3 kA at the socket: the appliance below 1.5 kV, every SPD within its ratings; without type 3, 5.75 kV. PV (D49): 5 / 10 / 20 kA 8/20 µs: the charger's input at 121 / 129 / 138 V (its MOSFETs 200 V), every SPD and the TVS within ratings, the SPDs modelled at the data sheet's maximum Up; without the array SPD 303 V at the charger and 26 kV at the modules. |
| 3 | Firmware | None. |
| 4 | Board | None: DIN-rail devices in the distribution boards and the PV enclosures. |
| 5 | Costed parts list | PV side: **€724** at DEHN list price (952518 €391.10, 952513 €332.90). Mains side: about €251, but with "or equivalent" estimates and loose parts where a product belongs (open item 1). |
| 6 | Documents | Installation guide, commissioning procedure with record sheet, user manual with maintenance and FAQ (this folder); design notes and DFMEA (above). Design document (PDF, Word) still to do. |
| 7 | Independent review | Not yet: after open item 1. |
| 8 | Package and sign-off | Not yet. |

## Open

1. **Mains side, products (your decision).** The model and parts list still carry generic
   "SPD-T1+2 275" / "SPD-T2 275" (Phoenix "or equivalent", estimated prices) and, at the
   sub-board and the socket, loose varistors and gas discharge tubes where a type 2 "1+1" and a
   type 3 product belong. DEHN's catalogue (now reachable) offers, at list price:
   - type 1+2: DEHNshield TN 255 (941200, €434.80; spark-gap based, Iimp 12.5 kA, Up ≤ 1.5 kV)
     or the FM version (941205, €473.90). Our model is varistor-based; a spark gap would need
     its own model (one chattered under an ideal surge source in November);
   - type 2 "1+1" for the sub-board: DEHNguard family (e.g. DG MP TT 2P ACI 275 FM, 942121,
     €286.10, In 20 kA);
   - type 3: DEHNrail M 2P 255 (953200, €138.30; Uc 255 V, In 3 kA, Uoc 6 kV).
2. **Page references** of the DEHN data sheets 952513_GL-en.pdf and 952518_GL-en.pdf: the PDFs
   are on DEHN's download host (dxeifbnwdc27t.cloudfront.net), which this environment does not
   allow; the values were taken from DEHN's online catalogue pages.
3. Schematic PDF/SVG, design document, independent review, package.
