# Reliability and planned maintenance of the power designs (decision D22)

Requirement: a mean time between failures (MTBF) of at least 5 years, with only predetermined,
planned maintenance steps.

## 1. Method

The app's reliability prediction (`app/ui/src/eda/reliability.ts`, the **Reliability** tab
of the schematic editor):

- **Random failures:** parts-count method in the manner of IEC 61709 and SN 29500. Each part
  has a reference failure rate at 40 °C (FIT, failures per 10⁹ device hours) of its class; it
  is multiplied by a temperature factor (Arrhenius, activation energy of the class) at the
  temperature the part works at — the air, plus about 10 K for ICs, plus the self-heating
  P × (RthJC + heatsink) for power semiconductors after a simulation — and by a stress factor
  from the stress check (1 up to 50 % of a rating, 1.5 up to 80 %, 3 up to 100 %). Every pin
  adds a solder joint (0.1 FIT). The total is multiplied by an environment factor of 2
  ("ground fixed": a closed enclosure in an uncontrolled, hot and humid climate, after
  MIL-HDBK-217F).
- **Wear-out** is not a random failure and is calculated apart, at the expected use:
  electrolytic capacitors (105 °C 10 000 h types, life doubling per 10 K below 105 °C, hot spot
  5 K above the air), relay and contactor contacts (electrical life at their load, operations
  per day), varistors (surges per year against the surge life at that level).
- The reference rates are indicative values of the order given in SN 29500 for industrial
  parts. For a product they are replaced by the chosen manufacturers' reliability data.
  Parts-count predictions are known to be optimistic against field data (Fraunhofer and NREL
  fleet studies, FIELD_FAILURES.md section 1): the field MTBF is dominated by installation,
  environment and wear-out, which is why the DFMEA treats those first and the prediction
  only has to show a wide margin.

## 2. Results (tests/reliability.test.ts)

Use: change-over 20 transfers a day; stabiliser 200 tap changes a day (a very unstable grid);
50 surges a year at each varistor; 24 h operation.

| Design | Parts | Solder joints | FIT at 45 °C | MTBF at 45 °C | MTBF at 50 °C |
|---|---|---|---|---|---|
| Change-over 1P | 105 | 262 | 995 | 115 years | 97 years |
| Change-over 3P+N | 146 | 362 | 1335 | 85 years | 72 years |
| Stabiliser 1 kVA | 158 | 377 | 1123 | 102 years | 87 years |
| MPPT charger 3.7 kW | 159 | 381 | 1420 | 80 years | 64 years |
| Inverter 5 kW, 50 Hz transformer (P7a) | 234 | 571 | 1958 | 58 years | 47 years |

The figures are for the wired product drawings (D28): the auxiliary supplies, protection and
terminals are counted, the test-bench parts (sources, loads, battery model) are not, and parts
of one multi-unit package (LM339, LM393, LM358) share one package failure rate and its joints.

Every design exceeds the required 5 years by more than ten times, also at 50 °C. The largest
contributors are the contactors and breakers (change-over), the autotransformer and the
comparators (stabiliser), and the gate driver and timers (charger), the battery contactor, the two gate drivers, the 555 and the twelve power MOSFETs (inverter; contactor closing about five times a day).

Inverter, not yet in the figures: the bus electrolytics' life is taken at the 45 °C ambient;
their self-heating by the ripple current is not modelled, so their life will be shorter. Their
ripple current is to be checked against the datasheet rating with the layout (P8).

## 3. Wear-out and the planned maintenance

| Design | Part | Wears by | Life at the use above | Planned step |
|---|---|---|---|---|
| all | varistors (14D471K, 14D201K) | surges | 40 years at 50 surges a year | look at the varistor indicator / measure the leakage at each yearly inspection; replace after a nearby lightning strike or when the indicator shows |
| change-over | contactors K1, K2 | contact wear | 137 years at 20 transfers a day | inspect the contacts every 5 years (burn marks, resistance) |
| stabiliser | tap relays K1 … K6 (30 A) | contact wear | 60 years at 200 changes a day | none planned; a stuck relay is shown by its LED and cut off by the output protection |
| stabiliser | output relay K7 | contact wear | > 100 years | none planned |
| all | electrolytic capacitors (sense filters, auxiliary supply) | electrolyte loss | 52 years at 45 °C | none in the product life |

So the only planned maintenance is a **yearly inspection** (5 minutes, no tools beyond a
multimeter) and a **contact inspection every 5 years** for the change-over contactors; no part
has to be replaced on a schedule within the product life. The steps are in the help page
"Power designs: diagnostics, maintenance and repair".

Batteries, PV modules and the installation's surge protective devices are not part of these
products; their own maintenance follows their manufacturers.
