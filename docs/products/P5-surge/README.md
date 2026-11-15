# P5: surge and lightning protection of an installation

Worked example product of EmbedForge (NETApps Electric Simulation): an installation design, not
a board. Coordinated surge protective devices (SPDs) for a mains house (TN-C-S, single phase:
type 1+2 at the main board, type 2 in the sub-board, type 3 at the sockets of sensitive
equipment) and for the DC side of a house with the 48 V MPPT charger (P6): a certified type 2 PV
SPD at the array and at the charger (D49). Verified by simulation with the surges of the
standards (10/350 µs, 8/20 µs, 1.2/50 µs). **In progress**; not yet reviewed or signed off.

Design notes: `docs/inc3/POWER.md`, section P5. DFMEA: `docs/inc3/DFMEA.md`, section 3c.
Simulation: `app/ui/src/eda/surge.ts`, `app/ui/tests/surge.test.ts`; results in
`docs/inc2/TEST_REPORT.md`, sections 3n, 3n.1 and 3n.2.

## Status against the definition of done

| # | Element | State |
|---|---|---|
| 1 | Schematic | The two installations as circuit diagrams (`mainsHouse`, `pvHouse`); ERC clean (`tests/ercproducts.test.ts`). The PEN on a 16 mm² DIN-rail terminal. No board. PDF/SVG export for the package still to do. |
| 2 | DFMEA verified by simulation | `tests/surge.test.ts`, 11 of 11 pass on this commit. Mains (DEHN SPDs, the cables' capacitance and the SPDs' leads simulated): 12.5 kA 10/350 µs, 20 kA 8/20 µs and 6 kV / 3 kA at the socket: the appliance at most 1232 V L–N, 1152 V L–PE, 436 V N–PE (category I: 1.5 kV), every SPD within its ratings; without type 3, 5.7 kV. PV (D49): 5 / 10 / 20 kA 8/20 µs: the charger's input at 121 / 129 / 138 V (its MOSFETs 200 V), every SPD and the TVS within ratings, the SPDs modelled at the data sheet's maximum Up; without the array SPD 303 V at the charger and 26 kV at the modules. |
| 3 | Firmware | None. |
| 4 | Board | None: DIN-rail devices in the distribution boards and the PV enclosures. |
| 5 | Costed parts list | At DEHN list prices (EUR, without VAT): mains **€878.80** (941205 €473.90, 942220 €260.10, 953200 €138.30, PEN terminal €6.50); PV **€724.00** (952518 €391.10, 952513 €332.90). Cables, enclosures and earthing are the electrician's installation material. |
| 6 | Documents | Installation guide, commissioning procedure with record sheet, user manual with maintenance and FAQ (this folder); design notes and DFMEA (above). Design document (PDF, Word) still to do. |
| 7 | Independent review | Next. |
| 8 | Package and sign-off | Not yet. |

## Open

1. **Mains side: DEHN products (owner, 15 November 2026).** DEHNshield TN 255 FM (941205),
   DEHNguard MP TN ACI 275 FM (942220) and DEHNrail M 2P 255 (953200). The type 2 is the TN
   version of the proposed 1+1 (TT) one, 942121: in a TN-S sub-board the TT version protects
   L–PE only through two elements in series, and the simulation showed 1.67 kV L–PE at the
   appliance. Two model values are assumptions, to be confirmed: the DEHNshield's arc voltage
   (400 V, standing for its follow-current limitation) and the DEHNrail's N–PE spark-over (1 kV,
   derived from its two Up values; its circuit diagram is on the blocked download host).
2. **Page references** of the DEHN data sheets (952513, 952518, 941205, 942220, 953200): the PDFs
   are on DEHN's download host (dxeifbnwdc27t.cloudfront.net), which this environment does not
   allow; the values were taken from DEHN's online catalogue pages.
3. Schematic PDF/SVG, design document, independent review, package.
