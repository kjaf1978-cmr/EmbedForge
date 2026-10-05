# Phase 0 (f) — Default fabrication capability profile (PCB-05)

- Baseline: prompt v3.4
- Version: 0.1.0
- Date: 2026-10-05
- Status: draft
- Human review record (DOC-12): pending

**Scope.** PCB-05 requires at least one shipped, versioned "standard prototype profile". This file proposes it for FR-4 1.6 mm boards, 1–2 layers (4 optional), through-hole first. It does not cover ordering through fab APIs, which is out of scope. All sizes are in mm. "Published" means the figure is taken from the manufacturer's own capability page, accessed 2026-10-05.

**Method.**
- For each rule, take the **strictest** published minimum across the five fabs. A design passing that value is accepted by all of them.
- Then add a margin. The margin is 20–30 % where that does not break common KiCad footprints. Where it would break them, the margin is zero, and this is stated.
- Values marked **UNVERIFIED** were not on the fetched page, so they are not used to set a limit.

## 1. Published capabilities (standard / cheapest service, 1 oz outer copper)

| Rule | JLCPCB 1–2L | PCBWay std | OSH Park 2L | AISLER 2L 35 µm HASL | Eurocircuits PCB proto |
|---|---|---|---|---|---|
| Min track / space | 0.10 / 0.10 (2 oz: 0.16) | 0.10 / 0.10 | 0.1524 / 0.1524 | **0.200 / 0.150** (70 µm: 0.225 / 0.225) | 0.150 / 0.150 |
| Min mechanical drill | 0.15 (max 6.3) | 0.15 (max 6.0) | 0.254 | via 0.30–0.45; **PTH ≥ 0.5** (max 5.6); NPTH ≥ 0.5 | PTH 0.25 finished (tool = finished + 0.10); NPTH 0.35 |
| Min annular ring | PTH 0.18 abs, 0.25 recommended | 0.15 | 0.127 | **PTH 0.300**; via 0.200 | Class table is an image: UNVERIFIED. Oblong PTH long side ≥ 0.30 |
| Min via (drill / pad) | 0.15 / 0.25 | UNVERIFIED | 0.254 / 0.508 (KiCad rule set) | 0.30 / 0.70 (derived from drill + 2 × ring) | 0.25 finished ("≤ 0.45 = via") |
| Hole-to-hole (edge to edge) | via–via 0.20; **pad–pad 0.45** | UNVERIFIED | 0.127 | NPTH–copper 0.25 | 0.25 |
| Copper to board edge | 0.20 routed; 0.40 V-cut | UNVERIFIED (routing tolerance ±0.2) | **0.381** | 0.300 | UNVERIFIED |
| Solder mask expansion / dam | 1:1 / 0.10 | UNVERIFIED | 0.0508 recommended / 0.1016 (alignment 0.0762) | — / 0.100 (4L page: expansion 0.05) | UNVERIFIED |
| Silkscreen line / text height | 0.15 / **1.0** | 0.15 / 0.8 (width:height 1:5) | 0.127 recommended (0.076 short) / — | 0.150 / 0.8; 0.125 to pads (4L page) | UNVERIFIED |
| Outer copper | 1 / 2 / 2.5 / 3.5 / 4.5 oz | 1–8 oz | 1 oz | 35 µm or 70 µm | 18 µm base foil (finished after plating: UNVERIFIED) |
| Thickness | 0.4–2.0 (1.6 std) | 0.2–3.2 (1.6 std) | 1.6 nominal | 1.6 | **1.55** |
| Plated slot min width | 0.5 (2L), 0.35 (4L) | UNVERIFIED | 0.508 (drill slot) | UNVERIFIED (clearance 0.30 for slots < 1.8) | Oblong rule only |
| Layers | 1, 2, 4… | 1, 2, 4… | 2, 4 | 2, 4 | 2, 4 |

**4-layer differences (published):**
- JLCPCB: 0.09 / 0.09 track/space; ring 0.15 min (0.20 recommended); plated slot 0.35.
- OSH Park: 0.127 / 0.127; ring 0.1016; inner copper ½ oz.
- AISLER 4L 35 µm ENIG: 0.125 / 0.125; via drill 0.25–0.45; via ring 0.10; PTH ring 0.30; edge 0.30.
- Eurocircuits proto: inner foil 35 µm.

**Observations:**
1. **AISLER sets most of the binding limits.** These are: track 0.20, PTH drill ≥ 0.5 with vias limited to 0.30–0.45, and PTH ring 0.30.
   - If AISLER were removed from the list, the PTH ring would fall to 0.25 (JLC recommended) and the track to 0.1524 (OSH Park).
   - AISLER stays in the list because it is the main EU low-cost fab.
2. **Not every fab makes single-layer boards.** OSH Park, AISLER and Eurocircuits proto do not. A 1-layer design is therefore sent as a 2-layer board with the second copper layer empty. The generator must still emit both copper Gerbers, the second one empty.
3. **Some KiCad library footprints break the 0.30 PTH ring.** For example, TO-92 inline has a 0.75 drill and a 1.05 pad width, giving a ring of 0.15. The library check (PCB-02) must run profile DRC on footprints. A footprint that fails needs either a profile-specific variant or a warning.

## 2. Proposed profile `EF-PROTO-STD` v1.0.0 (hard DRC limits)

| Rule | Common strictest (source) | **Profile limit** | Margin |
|---|---|---|---|
| Min track | 0.200 (AISLER 2L HASL) | **0.25** | +25 % |
| Min clearance (copper–copper) | 0.1524 (OSH Park) | **0.20** | +31 % |
| Via drill window | 0.30–0.45 (AISLER) | **0.35–0.45** | +17 % on min |
| Min PTH (component) drill | 0.50 (AISLER) | **0.60**; no plated hole in (0.45, 0.60) | +20 % |
| Max PTH drill | 5.6 (AISLER) | **5.5**; larger holes NPTH or routed | — |
| Min NPTH drill | 0.50 (AISLER) | **0.60** | +20 % |
| PTH annular ring | 0.30 (AISLER) | **0.30** | **0** (a margin would fail common footprints) |
| Via annular ring | 0.20 (AISLER 2L) | **0.20** | **0** |
| Min via pad | 0.70 | **0.75** | — |
| Hole-to-hole, different nets (edge) | 0.45 (JLC pad–pad) | **0.50** | +11 % |
| Via-to-via (edge) | 0.25 (Eurocircuits) | **0.30** | +20 % |
| NPTH to copper | 0.25 (AISLER) | **0.30** | +20 % |
| Copper to board edge (routed) | 0.381 (OSH Park) | **0.50** | +31 % |
| Solder mask expansion | 0.05 (OSH Park, AISLER) | **0.05** | fab applies its own |
| Min solder mask dam | 0.1016 (OSH Park) | **0.10**; smaller dams are merged and flagged | 0 |
| Silkscreen min stroke | 0.15 (JLC, PCBWay, AISLER) | **0.15**, and stroke ≥ height ÷ 5 (PCBWay ratio) | 0 |
| Silkscreen min text height | 1.0 (JLC) | **1.0** | 0 |
| Silkscreen to pad | 0.125 (AISLER) | **0.15** | +20 % |
| Plated slot min width | 0.508 (OSH Park) | **0.80** | +57 % |
| Outer copper | 1 oz (common) | **35 µm** (2 oz not common: OSH Park 2L, Eurocircuits proto) | — |
| Inner copper (4L) | ½ oz (OSH Park) | **17.5 µm** assumed in IPC calculations | — |
| Thickness | 1.55–1.6 | **1.6 nominal**; mechanics tolerate ±10 % (UNVERIFIED per fab) | — |
| Layers | — | 1 (fabricated as 2), 2; 4 optional (same limits) | — |
| Finish | — | Any; HASL limits assumed because they are stricter | — |

## 3. Recommended design defaults for generated boards

These defaults sit at or above the profile limits.

| Item | Default | Basis |
|---|---|---|
| Signal track | 0.25 (at the profile minimum, so signals never neck down) | THT first; 0.5 A at ΔT 10 °C needs 0.115 |
| Clearance | 0.30 general. A custom rule allows **0.25** for a track between 2.54 mm-pitch pads | KiCad header pads are 1.7, leaving a 0.84 gap; 0.25 + 2 × 0.30 = 0.85 does **not** fit, 0.25 + 2 × 0.25 = 0.75 does |
| Power / load track | max(**0.5**, IPC-2221 width), ΔT 10 °C, outer layer only | See the table below |
| Via | **0.40 / 0.90** (ring 0.25). 0.40 / 0.80 is allowed but has zero margin against AISLER 2L | Profile §2 |
| Power via | 0.60 / 1.20, assume ≤ 1 A per via (est., to be checked by the (h) thermal test) | — |
| THT drill by max lead size d | d ≤ 0.5 → **0.8 / pad 1.6**; d ≤ 0.7 or 0.64 square (headers) → **1.0 / 1.7**; d ≤ 0.9 → **1.1 / 1.8**; d ≤ 1.1 → **1.3 / 2.2**; d ≤ 1.4 (screw terminals) → **1.6 / 2.6** | hole ≈ d + 0.25…0.3 (IPC-2222 level B practice); ring ≥ 0.35; square leads use the diagonal |
| Mounting hole | M3: NPTH 3.2, keep-out Ø 6.5 (or PTH 3.2 / pad 6.0 to GND) | — |
| Solder mask | expansion 0.05, min web 0.10 | — |
| Silkscreen | 1.0 text / 0.20 stroke; CM-08 revision tag 1.2 / 0.24 | Satisfies the 1:5 ratio |
| Zones | ground pour; clearance 0.30; min width 0.25; thermal gap 0.5, spoke 0.5; edge clearance 0.5 | — |
| Board edge | copper ≥ 0.5; connectors may overhang the edge but their pads must not | — |

**IPC-2221 external layer, 35 µm copper** (k = 0.048, I = k·ΔT^0.44·A^0.725). Computed widths in mm; the applied value is shown in brackets.

| Current | ΔT 10 °C | ΔT 20 °C |
|---|---|---|
| 0.5 A | 0.12 (→ 0.5) | 0.08 (→ 0.5) |
| 1 A | 0.30 (→ 0.5) | 0.20 (→ 0.5) |
| 2 A | 0.78 | 0.51 |
| 3 A | 1.37 | 0.90 |
| 5 A | 2.77 (use a pour) | 1.82 |

The inner layer at 17.5 µm needs about 5× the width: 1 A needs 1.56 at ΔT 10 °C. Therefore power is never routed on inner layers. The computed width and the ΔT used are recorded in DOC-08 (PCB-04).

## 4. Profile as data (YAML)

```yaml
profile:
  id: EF-PROTO-STD
  version: 1.0.0
  date: 2026-10-05
  status: draft            # DOC-12 review pending
  units: mm
  basis: strictest-of [JLCPCB, PCBWay, OSH Park, AISLER, Eurocircuits PCB proto] + margin
  stackup: {material: FR-4, thickness: 1.6, layers: [1, 2], layers_optional: [4],
            outer_cu_um: 35, inner_cu_um_assumed: 17.5, one_layer_fabricated_as: 2}
  limits:
    track_min:            {value: 0.25,  binding: 0.200,  src: aisler_2l_hasl}
    clearance_min:        {value: 0.20,  binding: 0.1524, src: oshpark_2l}
    via_drill:            {min: 0.35, max: 0.45, binding: [0.30, 0.45], src: aisler_2l_hasl}
    pth_drill:            {min: 0.60, max: 5.5, forbidden_open_interval: [0.45, 0.60], binding: [0.50, 5.6], src: aisler_2l_hasl}
    npth_drill_min:       {value: 0.60,  binding: 0.50,   src: aisler_2l_hasl}
    annular_ring_pth_min: {value: 0.30,  binding: 0.300,  src: aisler_2l_hasl, margin: none}
    annular_ring_via_min: {value: 0.20,  binding: 0.200,  src: aisler_2l_hasl, margin: none}
    via_pad_min:          {value: 0.75,  binding: 0.70,   src: derived}
    hole_to_hole_min:     {value: 0.50,  binding: 0.45,   src: jlcpcb}
    via_to_via_min:       {value: 0.30,  binding: 0.25,   src: eurocircuits_drilled_holes}
    npth_to_copper_min:   {value: 0.30,  binding: 0.25,   src: aisler_2l_hasl}
    copper_to_edge_min:   {value: 0.50,  binding: 0.381,  src: oshpark_2l}
    mask_expansion:       {value: 0.05,  src: [oshpark_kicad, aisler_4l]}
    mask_dam_min:         {value: 0.10,  binding: 0.1016, src: oshpark_2l, margin: none}
    silk_stroke_min:      {value: 0.15,  ratio_min_stroke_to_height: 0.2, src: [jlcpcb, pcbway, aisler_2l_hasl]}
    silk_text_height_min: {value: 1.0,   src: jlcpcb}
    silk_to_pad_min:      {value: 0.15,  binding: 0.125,  src: aisler_4l}
    plated_slot_width_min: {value: 0.80, binding: 0.508,  src: oshpark_2l}
    oblong_pth_ring_long_side_min: {value: 0.30, src: eurocircuits_drilled_holes}
  defaults:
    signal_track: 0.25
    clearance: 0.30
    clearance_between_2p54_pads: 0.25
    power_track_min: 0.5
    power_track_rule: {method: IPC-2221, k_external: 0.048, delta_T_C: 10, layer: outer}
    via: {drill: 0.40, pad: 0.90}
    power_via: {drill: 0.60, pad: 1.20}
    tht_by_lead_max: [ {lead_le: 0.5, drill: 0.8, pad: 1.6}, {lead_le: 0.7, drill: 1.0, pad: 1.7},
                       {lead_le: 0.9, drill: 1.1, pad: 1.8}, {lead_le: 1.1, drill: 1.3, pad: 2.2},
                       {lead_le: 1.4, drill: 1.6, pad: 2.6} ]   # square leads: use the diagonal
    silk: {text_height: 1.0, stroke: 0.20}
    zone: {clearance: 0.30, min_width: 0.25, thermal_gap: 0.5, spoke: 0.5, edge_clearance: 0.5}
  sources:   # all accessed 2026-10-05
    jlcpcb: https://jlcpcb.com/capabilities/pcb-capabilities
    pcbway: https://www.pcbway.com/capabilities.html
    pcbway_tolerances: https://www.pcbway.com/pcb_prototype/PCB_Manufacturing_tolerances.html
    oshpark_2l: https://docs.oshpark.com/services/two-layer/
    oshpark_4l: https://docs.oshpark.com/services/four-layer/
    oshpark_kicad: https://docs.oshpark.com/design-tools/kicad/kicad-design-rules/
    aisler_2l_hasl: https://community.aisler.net/t/2-layer-1-6-mm-35-m-hasl-design-rules/3735   # updated 2025-07-07
    aisler_2l_70um: https://community.aisler.net/t/2-layer-1-6mm-70-m-hasl-design-rules/5464  # updated 2025-12-04
    aisler_4l: https://community.aisler.net/t/4-layer-35-m-enig-design-rules/3733            # updated 2025-07-07
    eurocircuits_proto: https://www.eurocircuits.com/services/pcb-proto/
    eurocircuits_drilled_holes: https://www.eurocircuits.com/technical-guidelines/pcb-design-guidelines/drilled-holes/
```

**User-defined profiles (PCB-05)** use the same schema.
- Suggested built-in variants for a later release: `EF-JLC-2L` (0.15 / 0.15, PTH ring 0.25) and `EF-POWER-2OZ` (track 0.25, space 0.25).
- A design checked against one profile records that profile's id and version in DOC-08 and in the fabrication notes (PCB-06).

## 5. UNVERIFIED

- **Eurocircuits:** the pattern/drill classification values for annular ring, copper-to-edge, solder mask and legend. The class table is published only as an image. The finished copper thickness of the 18 µm base foil is also unconfirmed.
- **PCBWay:** hole-to-hole spacing, copper-to-edge, solder mask dam, plated slot width and via pad. These are not on the standard capability table.
- **AISLER:** plated slot minimum width.
- **OSH Park:** whether 2 oz is available on the 2L service.
- **JLCPCB:** the price thresholds. The published 0.15 mm via drill may carry a surcharge. This does not affect the profile.
- **Thickness tolerance** per fab.
- **IPC-2222 hole-allowance values:** quoted from practice; the standard was not fetched.
- **Per-via current** (≤ 1 A for 0.6 / 1.2): an estimate.

## 6. Fetch log

- The first attempts at JLCPCB and PCBWay timed out waiting for permission. The retries succeeded.
- help.aisler.net redirected in a loop, so the AISLER community pages were used instead.
- No refused fetch was bypassed.
