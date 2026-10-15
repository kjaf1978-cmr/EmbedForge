# Field failures of commercial power products in tropical use — input for the DFMEA

- Prepared: 15 October 2026 (Increment 3, power electronics track D20)
- Purpose: list the failures that commercial products of our five categories show in the field,
  with their root causes (physics of failure) and a mitigation that a discrete, analogue design
  can carry inherently. Section 8 is a table that can be copied into the DFMEA as rows.
- Scope: (1) automatic transfer / change-over switches with over/undervoltage protection and
  voltage/phase monitoring relays, (2) relay-tap and servo stabilisers (AVR), (3) MPPT and PWM
  solar charge controllers for 48 V lead-acid and LiFePO4 batteries, (4) off-grid / hybrid
  inverters (LF transformer and HF types, also in parallel), (5) surge protective devices.
- Environment of interest: 35–50 °C ambient, high humidity and condensation, monsoon, salt mist,
  mould, insects and small animals, dust, weak grids with outages, brownouts and surges, high
  lightning density, poor installation, generator supply, user overload.

## How to read this document

- **Confidence.** Each number carries one of three marks:
  **[firm]** = from a standard, a manufacturer document or a peer-reviewed paper;
  **[indicative]** = from a smaller study, a secondary source, slides or a vendor blog;
  **[practice]** = engineering rule of thumb or repair experience, no good statistics found.
- **Field data are thin for our exact products.** Good public statistics exist mainly for
  grid-tied PV inverters in Europe and the USA (Sandia, NREL, Fraunhofer). For stabilisers,
  change-over switches and off-grid inverters in Africa, South Asia and South-East Asia, public
  data are mostly repair reports, forum threads and small field surveys. We say this where it
  matters. The physics of failure is well known and is the stronger basis for the DFMEA.
- Sources are numbered [S1]…[S48] and listed with URLs in section 9.

---

## 1. Background: what drives failure in power electronics

### 1.1 Field statistics we can rely on

| Finding | Source | Confidence |
|---|---|---|
| Inverters are a leading source of hardware failures and energy loss at PV sites (machine-learning study of about 55,000 maintenance records, 800+ US sites). | Gunda et al., Sandia/NREL [S1], [S2] | firm (component shares are in the full paper, not reproduced here) |
| Sandia study of 126 systems: 76 % of 196 observed failures were in the PV inverter. SunEdison: 43 % of tickets assigned to inverters, then the AC subsystem. | quoted in IMEKO TC10 2016 paper [S3] | indicative (old, small sample) |
| Sandia 2009: 37 % of hard PV system failures in central inverters, IGBT the most common failing part; SunEdison 2008–2010: 51 %. | DfR slides quoting Sandia [S4] | indicative |
| Fraunhofer ISE fleet of more than 19 GW of PV inverters: after 10 years, no clear sign of wear-out; high infant mortality (manufacturing defects that end-of-line test misses); humidity suspected as driver of not-yet-defined failure mechanisms. | Kulenkampff et al. PCIM 2022 [S5]; ECPE workshop summary [S6] | firm for the trend, numbers not public |
| Sandia work: no consensus on "the least reliable part"; IGBTs and DC-bus capacitors are the main suspects; bus-capacitor degradation raises ripple, which accelerates further degradation (positive feedback). | Kaplar et al. [S7], [S8] | firm |
| Small off-grid study (38 systems): 52.6 % of failures within the first year; main causes poor installation, non-deep-cycle batteries, poor system design, no maintenance. | FUDMA J. Sciences field paper [S9] | indicative |
| Lab test of market-leading off-grid components: none met all criteria; failures in inverter efficiency, reverse-polarity protection of charge controllers, battery capacity. | Chowdhury & Mourshed 2016 [S10] | firm (lab, not field) |
| Tanzania (Bagamoyo, Uzi Island): about 20 % of solar home systems inoperative. | UDSM repository [S11] | indicative |
| Ghana audit of 166 solar home systems: lack of maintenance protocols and user-friendly manuals is a critical barrier. | pv magazine / UENR [S12] | indicative |

**What this means for us.** (a) Early-life failures from manufacturing, installation and wiring
are at least as important as wear-out. (b) Humidity is a real driver even in Europe, so in the
tropics it will be stronger. (c) The power semiconductors and the DC-bus capacitors are the
parts to watch in inverters and charge controllers; contacts are the parts to watch in
stabilisers and change-over switches.

### 1.2 Acceleration laws used in this document

| Mechanism | Model | Typical value | Confidence |
|---|---|---|---|
| Aluminium electrolytic capacitor, electrolyte loss | Arrhenius "10 °C rule": life doubles per 10 °C lower (L = L0 · 2^((T0−T)/10)) | 5,000 h at 105 °C → about 80,000 h at 65 °C | firm [S13], [S14], [S15], [S16] |
| Semiconductor chemistry (general) | Arrhenius, activation energy Ea about 0.7 eV | roughly ×2 per 10 °C at 50–100 °C | practice (depends on mechanism) |
| Humidity corrosion | Peck model: life ∝ RH^−n · exp(Ea/kT), n ≈ 2.7, Ea ≈ 0.8 eV | 85 °C/85 % RH test is about 100× more severe than 30 °C/70 % RH | indicative (Peck 1986, widely used; we did not re-check the original) |
| Solder and power-module interconnect fatigue | Coffin-Manson / Norris-Landzberg: cycles ∝ ΔT^−n, n ≈ 2 to 5 depending on the joint | halving ΔTj gives 4× to 30× more cycles | firm for the form [S17], [S18]; exponent depends on technology |
| IGBT/MOSFET module power cycling | LESIT / CIPS08 (Bayerer) models with ΔTj, Tj, ton, current | the old "10 K higher Tj halves life" rule fits 1990s modules, newer die attach is less sensitive | firm [S17], [S19] |
| Fan bearings (grease) | L10 life doubles per 10–15 °C lower | ball bearing 60,000 h at 45 °C, sleeve 30,000 h at 45 °C (one vendor) | indicative [S20], [S21] |
| VRLA lead-acid battery | life halves per about 8 °C above 25 °C (vented: about 10 °C) | 10 years at 25 °C → 5 years at 33 °C → 2.5 years at 41 °C | indicative (vendor + APC paper) [S22], [S23] |

### 1.3 Reliability prediction handbooks (for the FMEA occurrence rating)

- **IEC 61709** gives reference conditions (for example 40 °C ambient, defined voltage stress)
  and conversion models (temperature, voltage, current) to move a reference failure rate to
  the real operating point. **SN 29500** (Siemens) is built on IEC 61709 with look-up tables of
  reference FIT values per part class; its values come largely from field returns, so they
  already include electrical overstress, and they are conservative [S24], [S25], [S26].
- **MIL-HDBK-217F** (1991) uses π-factors for temperature, quality, environment (for example
  GB ground benign, GF ground fixed, GM ground mobile). It is old and usually pessimistic for
  modern parts, but its environment factors are a useful reminder that "ground fixed, outdoor"
  is 2–6× worse than "ground benign" [practice].
- None of these handbooks has a real humidity, salt or insect factor [S26]. Tropical
  mechanisms must therefore be handled in the FMEA by design rules and by tests
  (IEC 60068), not by predicted FIT.
- **IPC-9592B** (power conversion devices) has a derating appendix for capacitors, resistors,
  diodes, transistors, magnetics, fuses, relays. The full numbers are behind a pay wall; the
  commonly quoted values (capacitor voltage 70–80 %, resistor power 50–60 %, Tj ≤ 80 % of
  maximum) are **[indicative]** until checked against Appendix A [S27].

---

## 2. Category 1 — Automatic transfer / change-over switches and voltage/phase monitoring relays

Typical product: two contactors (mains and generator or inverter), mechanical and electrical
interlock, voltage monitoring of each phase (over/under, sometimes phase loss, phase
sequence, asymmetry), time delays for transfer and return. Relevant standards:
IEC 60947-6-1 (transfer switching equipment), IEC 60947-4-1 (contactors), IEC 60255 family for
measuring relays.

### 2.1 Contact welding and pitting

- **What is seen.** Contactor stays closed after the coil is off, or a pole has high
  resistance and overheats; burnt contacts after a few months in places with many outages.
- **Root causes.**
  1. *Inrush on closing.* Capacitive loads (LED drivers, switch-mode supplies, PFC capacitors),
     motors, transformers and incandescent lamps draw 10× or more of steady current; worst when
     contacts close near the voltage peak. Contact bounce during this current draws small arcs
     that melt the contact surface and weld it ("tack weld") [S28], [S29].
  2. *Transfer onto a source that is out of phase.* When the change-over closes onto the
     generator while motors still produce residual voltage, the current can be up to twice
     the locked-rotor current [practice].
  3. *Utilisation category too low.* A contactor rated AC-1 (resistive) used for AC-3 / AC-4
     duty (motors, frequent switching) erodes fast [practice, IEC 60947-4-1].
  4. *Chatter* from coil undervoltage (2.2) gives many make/break cycles under load.
  5. *Frequent operations.* A weak grid with 10–30 outages per day multiplies the number of
     operations by 10–50 against a European design assumption [practice].
- **Mitigation.** Size the contactor in AC-3 for the full rated load and at least one step
  higher than the load current (contactor current ≥ 1.25 × load, or ≥ 1.5 × for capacitive
  and LED loads). Use contact materials for high inrush (AgSnO2). Add a "dead time" (open
  time) of ≥ 0.5–1 s, preferably adjustable to 3 s, between opening one source and closing the
  other so that motor residual voltage decays. Use mechanical plus electrical interlock. For
  small relays use relays rated TV-8 / IEC 60669-1 high inrush, or an inrush NTC / series
  resistor bypassed after start [S28], [S29].

### 2.2 Coil burnout and chatter under undervoltage

- **What is seen.** Humming, buzzing, contactor opens and closes repeatedly in a brownout;
  coil insulation dark or open circuit; pole faces worn.
- **Root causes.**
  1. An AC coil draws 6–10× its holding current while the armature is open (low inductance).
     If supply voltage is between the drop-out and pick-up levels, the armature cannot seal and
     the coil overheats in minutes [practice].
  2. IEC 60947-4-1 requires pick-up at about 85 % (some sources say 80 %) of rated coil voltage
     and drop-out between about 75 % and 20 % (AC) — forum citations of the standard do not fully
     agree, so check the coil datasheet [S30], [S31]. In brownouts of 150–180 V on a 230 V coil,
     the coil can sit in the uncertain zone for a long time.
  3. Sags of 2–3 cycles already make standard AC coils drop out [S32].
  4. The coil is supplied from the same voltage it is supposed to monitor.
- **Mitigation.** Undervoltage lockout with hysteresis: the monitoring circuit must cut the coil
  completely below a firm threshold (for example 0.8 × Uc) and only re-energise above a higher
  threshold (for example 0.9 × Uc) after a delay. Prefer DC coils fed from a rectifier and
  capacitor, or a wide-range "electronic" coil, with a storage capacitor to ride through short
  sags. Choose a coil voltage that guarantees pick-up at the lowest mains you accept. Add a
  coil thermal fuse or PTC only as a last line.

### 2.3 Monitoring relay mis-trips, nuisance transfers and missed trips

- **Root causes.**
  1. *No or small hysteresis* → output toggles at the threshold (chatter) [practice].
  2. *No time filter* → trips on 10 ms spikes or on motor starting dips; or the opposite, a slow
     filter misses a dangerous overvoltage from a lost neutral.
  3. *Loss of neutral in 3-phase + N.* Single-phase loads see up to about 400 V; a relay that
     measures only phase-to-phase voltage will not see it [practice].
  4. *Regenerated voltage.* A motor running on two phases back-feeds the lost phase, so a
     voltage-only phase-loss relay sees a "healthy" phase [practice]. Asymmetry or phase-angle
     detection is needed.
  5. *Measurement drift* from humidity leakage across high-value divider resistors, carbon
     trimmer drift and corrosion, zener reference drift with temperature (see 7.6).
  6. *Generator supply.* A frequency of 45–55 Hz and wave distortion change the reading of an
     average-responding circuit (form factor error) [practice].
- **Mitigation.** Measure each phase to neutral and also phase to phase; trip on asymmetry.
  Use true-RMS or at least peak plus average comparison with known error for distorted waves.
  Define hysteresis of 2–5 % of nominal and separate delays: fast for overvoltage (≤ 100–200 ms
  above 270 V), slower for undervoltage (1–5 s). Use metal-film resistors (≤ 100 kΩ per
  element, several in series for creepage), cermet trimmers or fixed resistors instead of
  carbon trimmers, a band-gap reference (TL431 class) with a known temperature coefficient,
  and conformal coat the divider area.

### 2.4 Restart storms after an outage

- **Root cause.** When mains returns, all houses and all loads restart at once; fridge and air
  conditioner compressors restart against full head pressure and stall; the change-over and
  stabiliser contacts carry the combined inrush; mains may fall again and cycle [practice].
- **Mitigation.** Return delay after the source is healthy (adjustable, for example 10 s to
  3 min; compressor protection needs about 3 min). If possible a random or staggered delay per
  unit.

### 2.5 Terminal heating

- **Root cause.** Loose screws from installer torque error, thermal cycling, aluminium cable
  creep and oxide, copper/aluminium galvanic corrosion in humid air [S33], [S34]. Resistance
  rises, heating rises, oxide grows: positive feedback until the terminal burns.
- **Mitigation.** Box-clamp terminals rated for the cable size and for Al where Al cable is
  usual; printed torque value on the label; a temperature-indicating design margin (terminal
  temperature rise ≤ 50 K at rated current per IEC 60947-1); avoid PCB-mounted screw terminals
  for main current — use bus bars or contactor terminals.

---

## 3. Category 2 — Relay-tap stabilisers (AVR) and servo stabilisers

Typical relay type: autotransformer with 3–6 taps, one relay per tap step, comparator or
microcontroller selects taps; output accuracy about ±5–10 %; switching time 10–40 ms.
Servo type: continuously variable autotransformer (variac) driven by a motor through a carbon
brush, accuracy about ±1 %, slow (several V/s).

### 3.1 Relay contact erosion and welding (the dominant failure)

- **Evidence.** An Indian stabiliser manufacturer reports that most tap relays are damaged by
  arcing within about one year [S35]. Repair reports show burnt or stuck relays and burnt
  marks beside relays [S36], [S37]. **[indicative — no formal field study found]**
- **Root causes.**
  1. *Switching under load at random phase.* Breaking an inductive load current gives an arc;
     with tap change at every swing of a weak grid, relays do thousands of operations per month.
  2. *Break-before-make gap too short.* If the new tap closes before the arc on the old tap is
     out, the relays short the turns between the taps: a very high circulating current flows
     and welds contacts or blows the fuse [practice].
  3. *Hunting.* Without hysteresis, the output change by one tap step moves the input reading
     (source impedance) and the controller toggles between two taps.
  4. *Relay undersized.* Low-cost units use 30–40 A PCB relays near or above rating; contacts and
     PCB copper overheat.
  5. *Inrush on output.* The stabiliser output relay connects fridges and transformers with high
     inrush.
- **Mitigation.**
  - Zero-crossing tap change: open at current zero (the relay release time must be measured and
    compensated), close near voltage zero. Analogue: comparator on the voltage zero cross plus a
    fixed monostable delay equal to the measured relay operate time.
  - A defined dead time between opening the old tap and closing the new one (for example
    ≥ 5–10 ms, covering relay bounce and release time spread over life), checked with a
    hardware interlock so that two tap relays can never be energised together.
  - Hysteresis between taps of at least 1/2 of a step plus a minimum dwell time (for example
    0.5–2 s) per tap.
  - Relay current derating: continuous ≤ 70 % of rated at 50 °C ambient; check the relay
    electrical-life curve for cos φ 0.4 inductive.
  - RC snubbers across contacts (Omron guidance: C 0.5–1 µF per A, R 0.5–1 Ω per V, verify in the
    real circuit [S29]) or a varistor across the transformer tap section.

### 3.2 Transformer overheating and burnout

- **Root causes.** Long operation at the lowest tap (highest boost) during brownout: the
  current in the boost part of the winding is higher than at nominal; user connects more load
  than rating; generator frequency below 50 Hz raises flux (V/f), the core saturates and
  magnetising current rises sharply; high ambient and dust on windings; enamel insulation
  ages (Arrhenius, roughly ×2 per 10 °C, class B 130 °C / F 155 °C) [practice].
- **Mitigation.** Size the winding for the full output current at the maximum boost tap and
  at 50 °C ambient; flux density at 45 Hz and 1.1 × maximum input voltage below saturation;
  thermal cut-out (bimetal, auto-reset with hysteresis or manual reset) embedded in the
  winding; output overload cut-out; class F insulation with class B temperature use.

### 3.3 Over-voltage passed to the load

- **Root causes.** A tap relay welds in a boost position, then the mains returns to normal or
  high → output becomes 270–300 V; controller fails (capacitor dry-out, trimmer drift);
  relay operate time 10–20 ms lets a fast swell pass [S36], [practice].
- **Mitigation.** An independent overvoltage cut-off on the output (separate comparator,
  separate reference, separate output relay) that disconnects the load above for example
  255–260 V; it must not depend on the tap logic. This is the single most important
  inherent safety feature of the stabiliser.

### 3.4 Control-board failures

- **Root causes.** Small electrolytic capacitors in the relay supply dry out next to the hot
  transformer; carbon trimmers drift; relay driver transistor fails by coil back-EMF without a
  diode; PCB corrosion and insect debris (section 7). A V-Guard repair report shows stuck
  primary relay plus capacitors and trimmers replaced [S37].
- **Mitigation.** 105 °C long-life capacitors placed away from the transformer; free-wheel
  diodes on every coil; fixed resistors; coating; relay coil supply with undervoltage lockout so
  relays never sit half-energised.

### 3.5 Servo type (for comparison)

- **Dominant failure.** About 99 % of failures of continuously adjustable autotransformers are
  overheating at the brush and at the winding track under the brush (General Radio, 1953)
  [S38]. Brushes wear and must be replaced; wrong brush material shorts adjacent turns [S39].
  Motor and gear wear, limit-switch failure and slow response to fast swings are also common
  [S40]. **[indicative / historical]**
- **Lesson for our relay design.** Relay type has no sliding contact but more switching
  events; servo type has continuous wear plus maintenance. Both need an independent output
  overvoltage cut-off.

---

## 4. Category 3 — Solar charge controllers (MPPT and PWM, 48 V systems)

Typical MPPT: synchronous buck converter from PV (for example 100–250 V open circuit) to a
48 V battery; input and output electrolytic capacitors; inductor; MOSFETs; temperature
sensor; battery voltage sensing. PWM: one MOSFET (or two back-to-back) connecting PV directly
to the battery.

### 4.1 Input overvoltage

- **Root causes.** String Voc is set at 25 °C cell temperature; it rises about 0.3 %/°C as the
  cell gets colder. At first light after a cool night the controller is not yet loading the
  array, and the input sees the temperature-corrected Voc [S41], [S42]. In tropical lowlands the
  minimum cell temperature is only about 15–22 °C, so the extra is small (1–3 %), but in
  highlands (East Africa, Andes) nights can be near 0 °C (+8–10 %). More frequent in practice:
  installers add one panel too many to a string. Lightning surges on long PV cables are added.
- **Mitigation.** Input rating ≥ 1.2 × the highest string Voc the manual allows; input MOSFETs
  and capacitors rated for that Voc at 80 % derating; a hardware comparator that stops
  switching above the limit (stopping does not protect if Voc itself exceeds the part rating);
  input clamp (TVS / varistor) and DC SPD; a clear label "max. Voc at the coldest morning".

### 4.2 Reverse polarity and wrong connection order

- **Root causes.** PV or battery wired in reverse; PV connected before the battery so that the
  controller's own supply comes from PV with no load on the output; reverse-polarity protection
  missing in tested commercial units [S10].
- **Mitigation.** Battery side: series fuse plus reverse diode (crowbar) or series P-MOSFET /
  ideal-diode; PV side: series diode or back-to-back MOSFET; both rated for the full short
  circuit current. Output stage must survive "PV present, no battery" without overvoltage
  (output clamp and hardware stop).

### 4.3 Battery disconnect while charging ("load dump") — BMS interaction

- **Root cause.** A LiFePO4 BMS opens its MOSFETs at over-voltage, over-temperature
  (often 45–55 °C charge limit, reachable in a tropical battery room) or over-current. The
  buck converter cannot stop in zero time; energy in the inductor and the PV current charge the
  output capacitor; the output voltage jumps and can damage the controller and every load on
  the DC bus. Users report spikes; opinions on damage differ [S43]. **[indicative]** A
  connected inverter absorbs part of the energy.
- **Mitigation.** Fast hardware output overvoltage comparator (cycle-by-cycle, < 10 µs) that
  stops the gate drive; output TVS sized for the inductor energy; output capacitors rated with
  margin above the absorption voltage (for example 100 V parts on a 48 V bus); a "battery
  present" check before start; signal input from the BMS (charge-enable contact) so that the
  controller stops first.

### 4.4 MOSFET failures

- **Root causes.**
  1. *Avalanche from stray inductance* at turn-off: most avalanche failures come from unclamped
     inductance of PCB traces, wiring and package, not from intended avalanche [S44].
  2. *Body diode reverse recovery / shoot-through* in the synchronous buck when dead time is too
     short or the gate driver supply is low [S45].
  3. *Gate oscillation* in paralleled MOSFETs without individual gate resistors.
  4. *Thermal overstress* from poor heat-sink contact (loose screw, dried thermal paste),
     blocked air path (dust, insect nest) and high ambient.
  5. *High-side short* (synchronous buck) or PWM switch short: the PV is connected directly to
     the battery with no regulation → battery overcharge and, for LiFePO4, BMS trip.
  6. *Night reverse current* from battery through the body diode into the PV array.
- **Mitigation.** VDS rating ≥ 1.25 × highest Voc (80 % derating) including ringing; snubber and
  low-inductance layout; gate driver undervoltage lockout; fixed dead time from RC delay and
  Schmitt trigger; individual gate resistors; Tj ≤ 110–125 °C at 50 °C ambient and full power
  (or ≤ 80 % of the rated maximum); independent battery overvoltage disconnect (relay or second
  MOSFET) so one shorted switch cannot overcharge the battery; back-to-back input MOSFET or
  Schottky diode against night reverse current.

### 4.5 Capacitor dry-out

- **Root cause.** Input and output electrolytic capacitors carry switching ripple current; core
  temperature = ambient + self-heating (ESR × I²). At 50 °C ambient inside a hot enclosure,
  capacitors near the inductor reach 75–85 °C. Life follows the 10 °C rule [S13]; ESR rises as
  electrolyte is lost, ripple rises, heating rises (positive feedback, also seen in inverter
  DC buses [S8]).
- **Mitigation.** 105 °C long-life types (≥ 5,000–10,000 h rated), ripple current ≤ 70–80 %
  of rated at the real frequency and temperature; compute life at the hot-spot temperature for
  ≥ 10 years at the mission profile; prefer film or ceramic capacitors for the high-frequency
  ripple and use electrolytics only for bulk; mount away from inductors and heat sinks.

### 4.6 Charging algorithm and sensing errors

- **Root causes.** No temperature compensation for lead-acid (about −3 to −5 mV/°C per cell is
  standard practice) → chronic overcharge and dry-out at 40 °C; voltage drop in battery cable
  read as battery voltage; wrong profile (lead-acid profile on LiFePO4 or the reverse);
  divider drift in humidity.
- **Mitigation.** Remote battery sense or Kelvin sense with protected leads; battery
  temperature sensor with fail-safe (open sensor → lowest safe voltage); hardware absolute
  voltage limit independent of the regulation loop; jumper-selected chemistry with clear
  marking.

### 4.7 PV array side problems seen by the controller

- **DC connector failures.** Field-assembled, poorly crimped or mixed-brand MC4-type
  connectors are a leading cause of PV fires. Sandia/EPRI (Bill Brooks) rank poorly assembled
  connectors first, poor-quality connectors second [S46]; TNO (Netherlands) and Energy Safe
  Victoria rank cross-mating of different brands as a chief cause; Victoria audits found about
  30 % of systems with mismatched connectors in 2019 and about 8 % in 2022 [S47], [S48].
  **[firm that connectors matter; the ranking of causes is disputed]**
- **Ground faults** from damaged cable insulation (rodents, UV, sharp edges) and wet junction
  boxes; with a transformerless controller the battery negative may then carry PV fault current.
- **Reverse current into a shaded or faulty string** when more than two strings are in
  parallel without string fuses.
- **Mitigation (controller side).** Terminals for the full cable size; DC-rated input breaker or
  fuse; insulation monitoring or at least a ground-fault fuse when the battery is earthed;
  string fuses / diodes for ≥ 3 parallel strings; DC SPD at the input.

### 4.8 PWM controllers (comparison)

- PWM types are simpler and more rugged (no inductor, no high input voltage) but waste PV
  power and run hot at full current; a shorted switch overcharges the battery. The same
  independent overvoltage disconnect is needed.

---

## 5. Category 4 — Off-grid and hybrid inverters (12/24/48 V to 230 V)

Two families. **Low-frequency (LF) transformer type:** MOSFET bank in push-pull or H-bridge at
50 Hz PWM on the battery side, 50 Hz transformer steps up; heavy, rugged against surge loads.
**High-frequency (HF) type:** DC-DC converter (push-pull or full bridge, 20–100 kHz) to a
DC bus of about 380–400 V, then an H-bridge with output filter; light, efficient, less surge
capacity. Hybrid units add a transfer relay to mains/generator and often a charger.

### 5.1 Power semiconductor failures (the largest group)

- **Root causes.**
  1. *Overload and surge loads.* Motors, compressors, pumps and transformer loads draw 3–7×
     rated current at start; capacitive rectifier loads draw high peak current. HF types reach
     current limit quickly; LF types carry it through the MOSFETs on the battery side.
  2. *Unequal current sharing in paralleled MOSFETs* (LF type, 10–30 devices): gate
     oscillation and layout asymmetry make one device carry more; it fails short and the bank
     follows.
  3. *Avalanche on turn-off* from transformer leakage inductance and wiring [S44].
  4. *Shoot-through* in a bridge leg from too short dead time, gate driver undervoltage at low
     battery, or noise coupling into the gate [S45].
  5. *Thermal cycling* of solder and wire bonds (ΔTj from load cycles, day/night) [S17], [S18].
  6. *DC saturation of the LF transformer* if the two half-cycles are not symmetrical; current
     rises in every cycle until the MOSFETs fail.
  7. *Sandia tests*: a few IGBTs failed within manufacturer limits; IGBT was the most common
     failing part in central inverter data [S4], [S7].
- **Mitigation.** Cycle-by-cycle current limit in hardware (comparator, sense resistor or
  current transformer, < 2 µs), plus a slower thermal overload; desaturation detection for
  IGBTs; voltage derating VDS ≤ 80 % including spike; gate resistor per device, gate-source
  zener and resistor; dead time from hardware; driver UVLO; Tj ≤ 125 °C at worst case (50 °C
  ambient, rated surge); limit ΔTj per load cycle (≤ 40 K) by heat sink sizing; volt-second
  balance or DC blocking in the push-pull; soft start of the output.

### 5.2 DC-bus and battery-side capacitor failures

- **Root causes.** A single-phase inverter draws power pulsing at 100 Hz from the DC side. The
  battery-side capacitors (LF type) or the 400 V DC-bus capacitors (HF type) carry large
  100 Hz ripple current. At high ambient, electrolytic capacitors dry out; ESR rise increases
  ripple and heat — a positive feedback shown by Sandia [S8]. The battery connection spark
  (5.3) also stresses them.
- **Mitigation.** Ripple current calculation at 100 Hz and switching frequency; capacitor
  life ≥ mission life at the hot-spot (10 °C rule); 105 °C long-life types; consider film
  capacitors for the DC bus of HF types (higher cost, much longer life, no dry-out); split the
  ripple between several capacitors with equal thermal conditions.

### 5.3 Inrush on battery connection

- **Root cause.** Connecting the battery to an empty capacitor bank gives a current of
  thousands of amperes for a few milliseconds: a spark that pits terminals and breaker contacts
  and can break capacitors; with LiFePO4 the BMS may see a short circuit and trip, then retry
  repeatedly [practice].
- **Mitigation.** Pre-charge circuit (resistor through a small switch or automatic, then bypass
  contactor or MOSFET); or a pre-charge resistor on the terminal with instructions; DC-rated
  breaker or fuse at the battery (class T or NH for LiFePO4 short circuit current).

### 5.4 Low-battery and battery interaction faults

- **Root causes.** Deep discharge of lead-acid (sulfation) because the low-voltage cut-off
  ignores voltage drop under load; LiFePO4 BMS disconnects suddenly under load, inverter
  input collapses, transfer relay and fans chatter; repeated restart attempts at low battery;
  wrong cut-off for the chemistry.
- **Mitigation.** Low-voltage disconnect with load compensation and a large hysteresis
  (for example cut at 44 V, restart only at 50 V for a 48 V lead-acid bank) plus a delay;
  restart lockout after a number of attempts; separate setting for LiFePO4.

### 5.5 Generator and grid interaction (hybrid units)

- **Root causes.**
  1. *Transfer relay welding* when the inverter connects to a generator or mains that is not in
     phase with its own output, or when it switches the full load inrush [S28].
  2. *Back-feed:* the inverter output reaches the grid side through a welded relay or an
     installer bypass — danger to line workers and damage when mains returns.
  3. *Poor generator regulation* (45–55 Hz, 180–260 V, distorted wave): the charger and the
     input voltage detection reject or accept the generator wrongly; LF chargers with phase-
     controlled thyristors draw distorted current that confuses the generator's AVR; the unit
     cycles on/off ("hunting").
  4. *Surges* from the grid enter through the AC input (see section 6).
- **Mitigation.** Synchronise before closing (phase and frequency check with a window); two
  relays in series on the AC input (one for each conductor, or redundant), with a check that
  each one has opened (back-feed protection); wide but defined acceptance window with time
  delay and hysteresis for the generator (for example 45–65 Hz, 170–270 V, accepted after 5–30 s
  stable); AC input SPD.

### 5.6 Paralleled inverters

- **Root causes.** Circulating current between units from phase or amplitude mismatch; loss of
  the synchronisation signal (cable, noise) → units fight and trip or fail; one unit fails short
  and the others feed into it; different firmware or settings in different units.
- **Mitigation.** In analogue designs: master-slave with a shared reference sine and fault line
  that stops all units if the sync signal is lost (fail-safe "no sync → no output"); droop
  sharing as a backup; output relay per unit with reverse-power detection; current-sharing
  check (difference amplifier) with trip.

### 5.7 Cooling and fans

- **Root causes.** Fan bearings wear out (L10 halves per 10–15 °C [S20], [S21]); dust, lint and
  insect nests block fins and fans; geckos and insects die in the fan; a seized fan is not
  detected. In many repair reports the inverter overheats repeatedly before the power stage
  fails [practice].
- **Mitigation.** Design so that the unit can deliver a reduced power without fan
  (natural convection rating) and derates instead of failing; thermal sensor on the heat sink
  (NTC or bimetal) with derating then shut-down; fan with ball bearings, IP54/IP55 fan or a
  sealed heat-sink tunnel separating the air path from the electronics; fan speed control by
  temperature (longer life, less dust); insect mesh at inlets.

### 5.8 Output-side faults

- **Root causes.** Short circuit at the output; capacitive and rectifier loads; load connected
  to the inverter output that also has a neutral-earth bond (earth loops); output voltage
  overshoot when a large load is disconnected.
- **Mitigation.** Hardware short-circuit limit and hiccup restart; output filter capacitor
  rated for 1.5× nominal voltage; clear neutral-earth arrangement in the manual and on the
  terminal label; output overvoltage clamp.

---

## 6. Category 5 — Surge protective devices (AC types 1/2/3 and DC for PV)

Relevant standards: IEC 61643-11 (AC SPDs for LV systems), IEC 61643-31 (DC SPDs for PV),
IEC 61643-12 / -32 (selection and installation), IEC 62305 (lightning protection), IEC 60364-5-534.

### 6.1 MOV ageing, leakage and thermal runaway

- **Physics.** Each surge damages some grain boundaries of the zinc oxide; varistor voltage
  falls and standby leakage rises. Leakage heats the device; heat raises leakage; the result is
  thermal runaway. Surge history is "perhaps the greatest single contributor" to this [S49],
  [S50], [S51]. A degraded MOV can pass into rapid burning at a standby current of a few tens of
  milliamperes, too small for a fuse to see [S52].
- **Quantitative points.** Datasheets give pulse-derating curves (permitted surge current falls
  with number of pulses and pulse length); exceeding them shifts the clamping voltage by more
  than ±10 %; maximum average power is only 0.25 / 0.4 / 0.6 / 1.0 W for 7 / 10 / 14 / 20 mm
  discs (Littelfuse UltraMOV) [S53]. Ratings also derate above about 85 °C body temperature.
  **[firm]**
- **Tropical aggravation.** Lightning flash density reaches about 150 flashes/km²/year in the
  eastern DR Congo and at Lake Maracaibo; Central Africa and north-west South America have high
  density the whole year [S54]. Many tropical regions have 20–80 flashes/km²/year
  against 1–5 in northern Europe [indicative]. Overhead low-voltage lines and weak earthing
  increase the induced surges. So the number of surges per year can be 10–50× the European
  case, and MOV end of life comes much sooner.
- **Mitigation.** Choose the MOV for the expected number of surges, not one surge (use the
  pulse-derating curve with a lifetime count, for example 100 surges at the expected level);
  thermally coupled disconnector (thermal fuse in contact with the disc) and a visible end-of-
  life indicator [S55]; series overcurrent protection for the short-circuit failure mode [S55];
  larger disc than needed (20 mm or 32/34 mm blocks); a GDT in series with the MOV to remove
  standby leakage (the MOV then sees no continuous voltage and ages much more slowly).

### 6.2 Temporary overvoltage (TOV) and loss of neutral

- **Root cause.** Loss of neutral, a broken PEN, a generator with a failed AVR, or a phase-to-
  neutral fault puts up to 400 V on a 230 V SPD for seconds to hours. The MOV conducts at
  power frequency and overheats; it is a TOV failure, not a surge failure. An SPD is not a
  protection against lost neutral [S56].
- **Mitigation.** Uc (maximum continuous operating voltage) of at least 275 V for 230 V
  systems, better 320–350 V where the grid often runs at 250–260 V; thermal disconnector;
  overvoltage disconnect function in the change-over / stabiliser (categories 1 and 2), which
  is the right place for long overvoltage protection.

### 6.3 GDT and spark gap follow current

- **Root cause.** On AC mains a GDT that fires can keep conducting (follow current) until the
  current zero; with a low-impedance source it can arc and fail; on DC it may never extinguish.
- **Mitigation.** GDT always in series with a MOV on AC (L–N) or used only N–PE; never alone
  across DC.

### 6.4 DC SPDs for PV

- **Root cause.** When an MOV fails on DC, the fault current has no current zero; an AC-rated
  thermal disconnector opens but the DC arc keeps burning and can start a fire.
  Reverse connection of polarised SPD modules is a further mistake [practice].
- **Mitigation.** Only DC SPDs to IEC 61643-31 with a DC-rated disconnector, Y-circuit (two MOVs
  plus GDT to earth), Ucpv ≥ 1.2 × the highest array Voc; place them at the controller and at
  the array if cable length is > 10 m.

### 6.5 Installation errors that make SPDs useless

- Long connection leads (about 1 kV per metre per kA/µs of surge current slope is the common
  rule) → the protected equipment sees much more than the SPD's Up [practice]. Missing or high-
  resistance earth (rural TT systems, dry or rocky soil, stolen earth conductors). No
  coordination between type 1, type 2 and type 3 devices. SPD on the wrong side of the
  main switch.
- **Mitigation.** In our designs: put type 3 protection inside the product (MOV L–N with
  thermal fuse, MOV+GDT to PE) so that the product is protected even when the installation is
  poor; leads ≤ 0.5 m total; earth terminal and clear label.

---

## 7. Cross-cutting tropical environment

### 7.1 Humidity, condensation and the "pumping" enclosure

- **Physics.** At 35 °C and 90 % RH the dew point is about 33 °C: any surface 2 °C colder than
  the air gets wet. Each day/night cycle, or a monsoon shower on a hot enclosure, makes the
  inside air contract; the pressure drop pulls humid air through gaskets ("pumping effect");
  moisture condenses on the coldest part (often the metal wall or the PCB near it) [S57],
  [S58]. A fully sealed enclosure without a vent stresses the gasket and still breathes
  through small leaks.
- **Electrochemical migration (ECM) and dendrites.** With a water film, a bias voltage and
  ionic contamination, metal (Ag, Cu, Sn) dissolves at the anode and grows dendrites to the
  cathode → leakage, then short. ECM can start from about 60–70 % RH at room temperature
  depending on surface [S59]; flux residues and sodium chloride lower the humidity threshold at
  which failures appear [S60], [S61]; pitch, voltage, temperature and contamination are the
  main factors [S60]. A field study of PCBs in outdoor atmospheres shows that contaminated
  medium plus high humidity is the critical factor [S62]. **[firm for mechanism]**
- **Mitigation.** (1) IP54 minimum, IP65 for outdoor or semi-outdoor units, with a membrane
  vent (ePTFE, Gore type) to equalise pressure and limit liquid water [S57], [S58]; (2) a
  drain hole / drip loop at the lowest point and cable glands from below; (3) keep the PCB
  warmer than the walls (self-heating, standby heater resistor of a few watts in very wet
  sites); (4) conformal coating to IPC-CC-830 (acrylic AR or polyurethane UR; silicone SR for
  high temperature), applied after cleaning; (5) no-clean flux removed or "ionic cleanliness"
  checked (IPC J-STD-001, ROSE test < 1.56 µg NaCl eq./cm² as an old reference value,
  [indicative]); (6) larger spacing between high-voltage nets (see 7.3).

### 7.2 Salt mist (coastal sites up to about 5–10 km from the sea)

- **Physics.** Chloride ions break the passive layer of metals, start pitting corrosion on
  terminals, relay contacts, unplated copper and steel screws; salt deposits are hygroscopic
  and keep the surface wet at lower RH; with dissimilar metals (Cu/Al, steel/Al) galvanic
  corrosion follows [practice].
- **Mitigation.** Tinned copper and nickel-plated or stainless terminals; avoid Al/Cu contact
  without bimetallic parts; enclosure of polycarbonate or powder-coated aluminium with
  stainless screws; coating of the PCB; sealed relays (RT III / RT V) for control relays.
  Test to IEC 60068-2-11 (Ka, neutral salt spray) or better IEC 60068-2-52 (Kb, cyclic salt
  mist, severity chosen for marine climate).

### 7.3 Creepage, clearance and tracking

- **Physics.** Wet dust and salt films on the insulating surface carry leakage current; small
  arcs carbonise the board ("tracking"); the carbon path grows until flashover. IEC 60664-1
  pollution degree (PD) 2 assumes only occasional temporary conductivity by condensation;
  PD 3 assumes conductive pollution or dry pollution that becomes conductive by condensation —
  this is the realistic class for an unconditioned tropical room or a garage [firm, IEC 60664-1].
- **Mitigation.** Design creepage for PD 3 and material group IIIa/IIIb (normal FR-4 has a CTI
  of about 175–250 V, so group IIIa/IIIb); for 230/400 V mains (300 V rated to earth) the
  basic-insulation creepage at PD 3, group III, is about 4 mm (check the table for the actual
  working voltage); reinforced insulation doubles it. Add slots in the PCB between mains nets,
  coating as extra help (the standard allows reduced spacing only under defined coating
  conditions). Overvoltage category III for equipment at the distribution board, IV for
  equipment at the origin of the installation (change-over switches can be in OVC IV).

### 7.4 High ambient temperature

- **Physics.** Inside a metal box in the sun or in a roof space, internal air can be 15–25 K above
  the 35–50 °C ambient. All Arrhenius-type mechanisms (capacitors, fans, batteries, insulation)
  speed up: 20 K hotter means about 4× faster ageing of electrolytic capacitors [S13] and about
  2× faster ageing of VRLA batteries per 8 K [S22]. LiFePO4 calendar fade is clearly measurable
  at 45 °C and much stronger at 60 °C, worst at high state of charge [S63], [S64].
- **Mitigation.** Thermal design for 50 °C ambient at full rated power (not 25 °C or 40 °C);
  derating curve above 40–45 °C published and implemented by hardware (NTC on heat sink,
  current-limit reference reduced with temperature); battery in the coolest place, float
  voltage reduced with temperature for lead-acid, LiFePO4 stored and floated below 100 % SOC;
  white or reflective enclosure; no direct sun on the unit (installation rule).

### 7.5 Mould, fungus

- **Physics.** Above about 70 % RH and 25–35 °C, fungi grow on dust, organic residues, some
  plastics, cotton-based materials and on flux residues; the hyphae hold water and acid
  metabolites on the board → leakage, corrosion, tracking [practice].
- **Mitigation.** Fungus-resistant materials (no paper, cotton, untreated wood; tested to
  IEC 60068-2-10 test J), clean boards, coating, sealed enclosure with vent, slight internal
  heating.

### 7.6 Measurement drift (analogue thresholds)

- **Physics.** Humidity and contamination create parallel leakage across high-value
  resistors (MΩ dividers on mains); carbon-track trimmers drift, corrode and lose contact;
  zener diodes drift with temperature (about ±2 mV/K for 5–6 V types, more for higher
  voltages); electrolytic capacitors in timers lose capacitance → wrong delays; opto-couplers
  lose current transfer ratio with time and temperature [practice].
- **Mitigation.** Divider impedance ≤ 1 MΩ total, made from several resistors in series
  (voltage and creepage); guard ring around high-impedance nodes; metal-film 1 % / 50 ppm/K
  parts; fixed resistors or sealed cermet trimmers with lock; band-gap reference; film
  capacitors (not electrolytics) for timing; window comparators with hysteresis; tolerance
  analysis over −10…+70 °C and life drift (worst case).

### 7.7 Insects, geckos, rodents

- **Evidence.** Fire ants are drawn into equipment after touching bare live contacts: current
  through the ant releases pheromones that attract more workers, who are shocked too;
  spacing and sheathing of contacts stopped the response in tests [S65], [S66]. Ants chew
  insulation, short circuits occur, and switching is blocked; damage in Texas alone was
  estimated at 146.5 million USD in 2001 [S67], [S68]. **[firm for ants; geckos, cockroaches,
  termites and rodents: practice / repair experience, no statistics found]** Typical results:
  contactors held open or shorted by ant bodies, gecko bodies across mains terminals or in
  fans, cockroach droppings causing leakage, rodents chewing PV cables (ground faults).
- **Mitigation.** No bare live parts reachable inside the enclosure (finger-safe terminals,
  shrouds over contactor terminals, IP2X internally); openings ≤ 1 mm (insect mesh in stainless
  steel or a membrane vent); cable glands with seals for every entry, unused entries plugged;
  conformal coating; contactor in a closed housing; cable in conduit or armoured outdoors.

### 7.8 Dust

- **Physics.** Dust blocks heat sinks and fans (thermal failure), carries salt and moisture
  (tracking), and in contacts raises contact resistance [practice].
- **Mitigation.** IP5X at least for the electronics compartment; heat sink with wide fin
  pitch (≥ 6 mm) outside the sealed compartment; natural convection where possible.

### 7.9 Grid and supply quality

- **Typical stress.** Frequent outages (several per day), long brownouts (150–190 V), swells
  after load shedding (250–280 V), lost neutral (up to 400 V), very fast swings (130 V to 220 V
  in a fraction of a second reported in Delhi [S69]), switching surges from capacitor banks
  and transformers, lightning surges, generator supply with ±5 Hz and poor wave shape.
- **Mitigation.** Every product must tolerate 0–440 V on the AC input for long time without
  damage (OFF state is acceptable), not only 180–260 V. Wide-range auxiliary supply or a supply
  that is disconnected above its limit. Staggered restart and minimum off time.

### 7.10 Installation and user errors

- **Common errors.** Reverse polarity on DC; wrong cable size; aluminium cable on copper-only
  terminals; screws not torqued; no earth; neutral and phase swapped; inverter output connected
  to the grid; no DC breaker; mixed PV connectors; batteries of different age or type in
  parallel; product mounted in the sun or above a stove; overloading (adding an air
  conditioner, a pump or a welding set) [S9], [S10], [S12], [S46], [S47].
- **Mitigation.** Design so that the obvious mistake is not possible or not destructive:
  polarised connectors or terminals with different sizes, reverse-polarity protection,
  phase/neutral independence where possible, overload protection by hardware, a printed wiring
  diagram on the inside of the cover, torque values on the label, a clear indication of the
  fault (LED code) so that the user does not bypass the unit.

### 7.11 Microcontroller lockups (for completeness)

Our designs are analogue. In commercial products a frequent field complaint is a frozen
controller after a surge or brownout (brown-out reset missing, watchdog disabled, EEPROM
corruption of settings). For our analogue designs the equivalent risks are: latch-up of CMOS
comparators from surges on input pins, undefined state of flip-flops at power-up, and a timer
that does not reset after a short outage. Mitigation: power-on reset with a defined delay
(RC + Schmitt trigger or supervisor IC), input series resistors and clamp diodes on every
comparator input, fail-safe default states (relay drivers off when the supply is low).

### 7.12 Climatic test plan (to verify mitigations)

| Test | Standard | Suggested severity for tropical use |
|---|---|---|
| Dry heat, operating | IEC 60068-2-2 (Bb) | 50–55 °C at full load, 16–96 h; storage 70 °C |
| Damp heat, cyclic | IEC 60068-2-30 (Db) | 40 °C upper, 93–95 % RH, 6 cycles (condensation on the board) |
| Damp heat, steady | IEC 60068-2-78 (Cab) | 40 °C / 93 % RH, 21 days, powered |
| Salt mist | IEC 60068-2-52 (Kb) | severity 2 or 3 for marine/coastal |
| Mould growth | IEC 60068-2-10 (J) | 28 days for materials not already proven |
| Temperature change | IEC 60068-2-14 (Nb) | −10 to +70 °C, 100 cycles (solder joints) |
| Dust and water | IEC 60529 | IP54 indoor, IP65 outdoor |
| Surge | IEC 61000-4-5 | 4 kV L-N, 4 kV L-PE (6 kV for OVC IV location) |
| Voltage dips / interruptions | IEC 61000-4-11 | plus long under/overvoltage test 0–440 V |
| Environment classes | IEC 60721-3-3 (stationary, weather-protected) and 60721-3-4 (not weather-protected) | the 2019 edition replaced the old classes (3K3, 3K5 …) with new ones (3K20–3K24); older editions had special tropical annexes; quote the edition used [S70] |

---

## 8. DFMEA table: root cause → inherent design mitigation

Columns: ID, category (C1 change-over / C2 stabiliser / C3 charge controller / C4 inverter /
C5 SPD / X all), failure mode, root cause (physics of failure), effect at product level,
inherent design mitigation, verification. Severity, occurrence and detection ratings are left
to the DFMEA team.

| ID | Cat. | Failure mode | Root cause | Effect | Inherent design mitigation | Verification |
|---|---|---|---|---|---|---|
| FF-01 | C1, C2, C4 | Contacts welded | Inrush of capacitive / motor / lamp loads at closing; contact bounce | Cannot disconnect; overvoltage or back-feed passes to load | AC-3 rating ≥ 1.25–1.5 × load current; AgSnO2 contacts; high-inrush (TV-8) relays; NTC or resistor pre-insertion | Make test with capacitive load at voltage peak, 10,000 operations |
| FF-02 | C1, C4 | Contacts welded / burnt at transfer | Closing onto out-of-phase source; motor residual voltage | Contactor damage, load damage | Dead time ≥ 0.5–3 s; synchronism check for inverter transfer; mechanical + electrical interlock | Transfer test with motor load |
| FF-03 | C1, C2 | Contact erosion, early end of life | Many operations from weak grid; breaking inductive current | High resistance, heating, fire | Electrical-life calculation for 20–50 operations/day × 10 years; RC snubber/varistor across contacts; zero-cross opening | Endurance test at cos φ 0.4 |
| FF-04 | C1 | Coil burnout / chatter | Supply between drop-out and pick-up; AC coil inrush 6–10× holding | Contactor fails, load cycles | Coil UVLO with hysteresis (off < 0.8 Uc, on > 0.9 Uc after delay); DC coil with storage capacitor; coil voltage chosen for lowest accepted mains | Slow ramp test 0 → 250 V → 0 V, 1 h at 170 V |
| FF-05 | C1, C2 | Output toggles at threshold | No hysteresis; source impedance changes reading after switching | Relay wear, load stress | Hysteresis 2–5 % of nominal; minimum dwell time; separate on/off delays | Ramp test around each threshold |
| FF-06 | C1 | Overvoltage from lost neutral not detected | Only line-line measured | Loads damaged at up to 400 V | Measure each L–N; asymmetry trip; fast overvoltage path (≤ 200 ms) | Lost-neutral simulation |
| FF-07 | C1 | Phase loss not detected | Regenerated voltage from motors on the lost phase | Motor burnout | Asymmetry / phase-angle detection, not only voltage level | Test with running 3-phase motor and one phase opened |
| FF-08 | X | Threshold drift | Humidity leakage across MΩ dividers; carbon trimmer drift; zener tempco; electrolytic timing caps | Wrong trip points, nuisance trips or no trip | Divider ≤ 1 MΩ in several series resistors; metal film 50 ppm/K; no carbon trimmers; band-gap reference; film timing capacitors; guard ring; coating | Worst-case analysis; damp heat cyclic test with threshold check |
| FF-09 | X | Restart storm, compressor stall | All loads restart together after outage | Contact and transformer overstress, repeated trip | Return delay after source is healthy (10 s–3 min), randomised if possible | Outage/return cycling test |
| FF-10 | X | Terminal overheating | Loose screw, thermal cycling, Al creep and oxide, Cu/Al galvanic corrosion | Burnt terminal, fire | Box-clamp terminals rated for Al and Cu; torque on label; current not through PCB screw terminals; temperature rise ≤ 50 K | Temperature-rise test; thermal cycling of terminals |
| FF-11 | C2 | Tap short-circuit | New tap closes before arc on old tap is out | Welded relays, burnt winding, fuse blows | Hardware interlock: two tap relays never on together; dead time ≥ 5–10 ms over relay life | Scope check of relay timing at end-of-life spread |
| FF-12 | C2 | Tap hunting | No hysteresis between taps | Relay wear, flicker | Hysteresis ≥ ½ step; dwell time 0.5–2 s | Input ramp test with source impedance |
| FF-13 | C2 | Output overvoltage to load | Tap relay welded in boost position; controller failure; slow relay | Appliance damage | Independent output overvoltage cut-off (own comparator, reference and relay) at 255–260 V | Fault insertion: tap relay forced closed |
| FF-14 | C2 | Transformer burnout | Long operation at maximum boost; overload; low generator frequency (V/f saturation); hot ambient | Unit dead, fire risk | Winding sized at max boost and 50 °C; flux at 45 Hz and 1.1 × Umax below saturation; embedded thermal cut-out; overload cut-out; class F insulation used at class B | Heat run at lowest input and full load; 45 Hz test |
| FF-15 | C2 | Relay drive failure | Missing free-wheel diode; coil supply sagging | Relay half on, contacts burn | Diode on every coil; coil supply UVLO | Review; brown-out test |
| FF-16 | C3 | Input MOSFET / capacitor overvoltage | String Voc too high (cold morning, extra module); surge | Controller destroyed | VDS and capacitor rating ≥ 1.25 × max Voc; input TVS/varistor; DC SPD; hardware stop above limit; label "max Voc" | Input 1.2 × Voc test |
| FF-17 | C3, C4 | Reverse polarity damage | Installer wires PV or battery in reverse | Converter destroyed, fire | Series diode / P-MOSFET / ideal diode; fuse + crowbar diode on battery; polarised terminals | Reverse connection test |
| FF-18 | C3 | Output overvoltage spike | BMS opens battery during charging (load dump); PV present without battery | Controller and DC loads damaged | Cycle-by-cycle hardware output OV stop (< 10 µs); TVS for inductor energy; output capacitors 100 V on 48 V; "battery present" check; BMS charge-enable input | Battery disconnect test at full charge current |
| FF-19 | C3 | Battery overcharged | High-side or PWM switch failed short | Battery damage, fire risk (lead-acid gassing, LFP BMS trip) | Independent battery OV disconnect (relay or second series switch) | Fault insertion: switch shorted |
| FF-20 | C3 | Night discharge | Reverse current from battery through body diode into PV | Battery flat | Back-to-back MOSFET or Schottky in PV input | Night test |
| FF-21 | C3, C4 | MOSFET avalanche | Turn-off spike from stray / leakage inductance | Device short | Low-inductance layout; RC or RCD snubber; VDS ≤ 80 % including spike | Scope VDS at max current and max input |
| FF-22 | C3, C4 | Shoot-through | Short dead time; body-diode recovery; low gate drive voltage; noise | Bridge leg short | Fixed hardware dead time (RC + Schmitt); driver UVLO; gate-source resistor and zener; Kelvin gate drive | Scope test over temperature and supply range |
| FF-23 | C4 | Paralleled MOSFET failure | Unequal sharing, gate oscillation | Bank failure | Gate resistor per device; symmetrical layout; device matching or source resistors | Thermal image under load |
| FF-24 | C3, C4 | Power device thermal fatigue | ΔTj cycling of solder and bond wires; high Tj | Device open/short after years | Tj ≤ 125 °C (or ≤ 80 % of Tjmax) at 50 °C ambient and rated surge; ΔTj ≤ 40 K per load cycle; good heat-sink clamping (spring clip, no thermal pad drying out) | Thermal measurement; power cycling of sample |
| FF-25 | C3, C4 | Electrolytic capacitor dry-out, ESR rise | Temperature and ripple current (10 °C rule); 100 Hz ripple in single-phase inverters | Ripple rises, more heat, controller instability, failure | 105 °C long-life types; ripple ≤ 70–80 % of rating at real temperature; life ≥ mission life at hot spot; film capacitors where possible; away from heat sources | Life calculation; capacitor hot-spot measurement |
| FF-26 | C4 | Spark / capacitor damage at battery connection | Inrush into empty capacitor bank | Pitted terminals, BMS trip, capacitor damage | Pre-charge circuit; DC-rated breaker or class-T fuse | Connection test with LFP battery |
| FF-27 | C4 | Battery deep discharge / chatter at low battery | LVD without hysteresis or load compensation; BMS sudden cut | Battery damage; relay and fan chatter | LVD with large hysteresis and delay; restart lockout after n attempts; chemistry setting | Low-battery ramp test |
| FF-28 | C4 | Transformer saturation (LF type) | Asymmetric half-cycles, DC offset | MOSFET overcurrent and failure | Volt-second balance; DC offset detection; current limit per half-cycle | Long run test, DC offset measurement |
| FF-29 | C4 | Back-feed to grid | Welded transfer relay; installer bypass | Safety hazard to line workers, damage when mains returns | Two independent relays in series with opening check; output voltage check on the AC input before inverter start | Fault insertion: one relay welded |
| FF-30 | C4 | Generator hunting / rejection | Wide frequency and voltage variation of generator | Unit cycles on/off, charger fails | Acceptance window 45–65 Hz, 170–270 V with stable time 5–30 s and hysteresis | Test on poorly regulated generator |
| FF-31 | C4 | Paralleled units fight | Loss of sync; phase/amplitude mismatch | Trip or failure of units | Fail-safe: no sync → no output; shared reference; per-unit reverse-power trip | Sync cable disconnection test |
| FF-32 | C4 | Overheating from fan failure | Bearing wear-out; dust; insects in fan | Power stage failure | Reduced-power rating without fan; NTC/bimetal derating then shut-down; ball-bearing IP55 fan; separate air tunnel; insect mesh | Fan blocked test |
| FF-33 | C4 | Overload / surge load failure | Motors, compressors, pumps, user adds loads | Power stage failure | Hardware cycle-by-cycle current limit; I²t overload; desaturation detection for IGBTs; soft start | Overload and short-circuit tests |
| FF-34 | C5, X | MOV degradation and thermal runaway | Cumulative surges; high lightning density; high ambient | Fire, loss of protection | Size MOV for surge count from pulse-derating curve; larger disc; thermal disconnector + end-of-life indicator; series overcurrent protection; GDT in series to remove standby leakage | Surge endurance test (repeated 8/20 µs); leakage check |
| FF-35 | C5, X | MOV failure by TOV | Lost neutral, PEN break, generator AVR failure (up to 400 V) | Fire, short | Uc ≥ 275 V, better 320–350 V; thermal disconnector; product-level OV disconnect | 400 V TOV test for 5 s and longer |
| FF-36 | C5 | GDT follow current | GDT alone across AC or DC | Fire, short | GDT only in series with MOV (L–N) or N–PE; never alone on DC | Review |
| FF-37 | C5, C3 | DC SPD fire | MOV failure on DC without DC-rated disconnector | Fire on PV side | IEC 61643-31 DC SPD; Y circuit; Ucpv ≥ 1.2 × max Voc | Review against standard |
| FF-38 | C5, X | Protection ineffective | Long SPD leads; missing earth; no coordination | Equipment damaged by surge | Internal type 3 protection in every product; short leads; earth terminal; installation guide | Surge test at product terminals |
| FF-39 | X | Leakage / short between tracks | Electrochemical migration and dendrites (humidity + bias + ionic residue, salt) | Malfunction, short, fire | Coating to IPC-CC-830; ionic cleanliness after soldering; wider spacing on biased nets; no-clean residue removed | Damp heat cyclic test powered; SIR test |
| FF-40 | X | Tracking / flashover on mains nets | Wet dust and salt films; low CTI | Short, fire | Creepage for PD 3 (about 4 mm basic at 300 V, check table), slots in PCB, material group IIIa/b; OVC III/IV clearances | Creepage review; damp heat test with hipot after |
| FF-41 | X | Condensation inside enclosure | Pumping effect, cold walls, monsoon | Corrosion, ECM, shorts | IP54/IP65 with membrane vent; drain hole; glands from below; PCB kept warmer than walls (self-heat or small heater) | Damp heat cyclic test in enclosure |
| FF-42 | X | Salt corrosion | Chloride on terminals and contacts; dissimilar metals | High resistance, open circuit, terminal fire | Tinned/plated terminals; stainless screws; no Al/Cu contact; sealed relays; coating | Cyclic salt mist IEC 60068-2-52 |
| FF-43 | X | Mould growth on boards | Organic residue, warm humid air | Leakage, corrosion | Fungus-resistant materials; clean boards; coating; vent | IEC 60068-2-10 for doubtful materials |
| FF-44 | X | Shorts by insects or small animals | Ants attracted to bare live contacts; geckos, cockroaches nesting | Short, contactor blocked, fire | No bare live parts (IP2X inside, shrouds); openings ≤ 1 mm or mesh; sealed glands; plugs for unused entries | Inspection with 1 mm probe; review |
| FF-45 | X | Overheating from dust | Blocked fins and filters | Derating, failure | IP5X electronics compartment; wide fin pitch outside; natural convection | Dust test IEC 60529 |
| FF-46 | X | Accelerated ageing by heat | 35–50 °C ambient + 15–25 K internal rise; sun on enclosure | Short life of capacitors, fans, batteries | Thermal design for 50 °C ambient at full load; hardware derating curve; reflective enclosure; mounting rule (no direct sun) | Heat run at 50 °C |
| FF-47 | C3, C4 | Battery early failure | High temperature (VRLA halves per 8 °C; LFP calendar fade at 45 °C+); no temperature compensation; chronic undercharge | Short battery life, outages | Battery temperature sensor with fail-safe; −3 to −5 mV/°C/cell compensation for lead-acid; LFP float below 100 % SOC; cut charging above set temperature | Charge profile test at 25 and 45 °C |
| FF-48 | X | Damage from wiring mistakes | Reverse polarity, wrong cable, phase/neutral swap, no earth | Product destroyed or unsafe | Polarised / keyed terminals; reverse protection; printed wiring diagram in cover; fault indication LED | Mis-wiring test set |
| FF-49 | X | Undefined state after surge or brownout | CMOS latch-up; no power-on reset; timer not reset | Wrong output state | Power-on reset with delay; series resistor + clamp on every comparator input; fail-safe defaults (drivers off at low supply) | Surge and dip tests with state check |
| FF-50 | C3 | PV connector arcing / fire | Poorly assembled or mixed-brand DC connectors | Fire on PV side | Controller input terminals rated for full cable; DC-rated input breaker; manual requires same-brand connectors | Installation guide review |
| FF-51 | C3 | PV ground fault | Rodent-damaged or UV-damaged cable; wet junction box | Fault current through battery negative | Ground-fault detection or fuse; DC insulation guidance; armoured/conduit cable | Ground-fault insertion test |
| FF-52 | C3 | String reverse current | ≥ 3 strings in parallel, one shaded or faulty | Module overheating | String fuses or diodes for ≥ 3 strings | Review |

---

## 9. Sources

Primary documents could not always be opened (some sites were not reachable from our
environment); in those cases the statement was taken from the publisher's abstract page or
from a secondary source, and the confidence mark says so.

- [S1] Gunda T. et al., "Machine learning analysis of inverter maintenance records", NREL/Sandia, 2020/2021 — https://nrel.gov/docs/fy21osti/78736.pdf
- [S2] Sandia, "Evaluation of component reliability in photovoltaic systems using field failure statistics", 2020 — https://www.sandia.gov/research/publications/details/evaluation-of-component-reliability-in-photovoltaic-systems-using-field-fai-2020-09-01/
- [S3] IMEKO TC10 2016 paper 073 (quotes Sandia 126-system study and SunEdison tickets) — https://imeko.org/publications/tc10-2016/IMEKO-TC10-2016-073.pdf
- [S4] DfR Solutions, "Overcoming 25 year life reliability challenges in solar electronics" (slides quoting Sandia 2009) — https://www.slideshare.net/slideshow/overcoming-25-year-life-reliability-challenges-in-solar-electronics/38929540
- [S5] Kulenkampff, Franz, Kiefer, Sans, "Reliability of Inverters in Photovoltaic Power Systems – A Detailed Field Data Analysis", PCIM Europe 2022 — https://www.vde-verlag.de/proceedings-en/565822044.html
- [S6] Fraunhofer publica record (field data, ECPE workshop) — https://publica.fraunhofer.de/handle/publica/427052
- [S7] Kaplar R. et al., "PV inverter performance and reliability: What is the role of the IGBT?", IEEE PVSC 2011 — https://sandia.gov/research/publications/details/pv-inverter-performance-and-reliability-what-is-the-role-of-the-igbt-2011-06-01-1
- [S8] Kaplar, Marinella, Granata, "PV inverter performance and reliability: What is the role of the bus capacitor?", IEEE J. Photovoltaics 2012 — https://www.osti.gov/biblio/1073266
- [S9] Off-grid PV field reliability study (38 systems), FUDMA Journal of Sciences — https://fjs.fudutsinma.edu.ng/index.php/fjs/article/download/5697/3723/18427
- [S10] Chowdhury & Mourshed, Renewable Energy 97 (2016) 585–598 — https://ideas.repec.org/a/eee/renene/v97y2016icp585-598.html
- [S11] "Impacts and Challenges of Solar PV Projects", Univ. of Dar es Salaam — https://repository.udsm.ac.tz/items/b7a4ae15-e213-44f1-a2d7-283c79dc84db/full
- [S12] pv magazine, "Field manual for off-grid residential PV in remote communities" (Ghana) — https://www.pv-magazine.com/?p=39800
- [S13] Würth Elektronik SN008, "Expected lifetime of aluminum electrolytic and aluminum polymer capacitors" — https://www.we-online.com/components/media/o173043v410%20SN008a%20EN.pdf
- [S14] ROHM TechWeb, capacitor lifetime ("10-degree rule") — https://micro.rohm.com/en/techweb/knowledge/acdc/acdc_sr/acdc_sr01/3177
- [S15] UltraVolt AP-22 (capacitor life example) — https://docs.ampnuts.ru/eevblog.docs/Vendors/UltraVolt/ap22.pdf
- [S16] Cornell Dubilier aluminium electrolytic application guide (quoted) — https://www.eevblog.com/forum/projects/aluminum-electrolityc-capacitors-operated-close-to-rated-voltage/msg4199857/
- [S17] Semikron Danfoss AN 21-001, power cycling lifetime models — https://assets.danfoss.com/documents/latest/444233/AB501650017495en-000201.pdf
- [S18] Bayerer et al., "Model for power cycling lifetime of IGBT modules", CIPS 2008 — https://vde-verlag.de/proceedings-en/453089004.html
- [S19] PCIM expert article, power cycling under thermal overload — https://news.pcim.mesago.com/power-cycling-under-thermal-overload-a-1033667/
- [S20] RS DesignSpark, "Why L10 life expectancy is key for fan durability" — https://www.rs-online.com/designspark/why-l10-life-expectancy-is-key-for-fan-durability-over-mtbf-ratings
- [S21] Digi-Key forum, fan bearings and longevity — https://forum.digikey.com/t/fan-bearings-longevity/13294/2
- [S22] Valen, "What are the effects of temperature on VRLA batteries" — https://valen.com.au/what-are-the-effects-of-temperature-on-vrla-batteries/
- [S23] APC battery life prediction paper (copy) — https://mathscinotes.com/wp-content/uploads/2013/03/BatteryLifePrediction.pdf
- [S24] IEC 61709 Ed. 2.0 preview — https://webstore.iec.ch/p-preview/info_iec61709%7Bed2.0%7Db.pdf
- [S25] Analog Devices, "Know your safety application notes – Part 1: Failure rates" — https://www.analog.com/en/resources/technical-articles/know-your-safety-part-1.html
- [S26] TI, functional safety FIT rate document using SN 29500 — https://www.ti.com/lit/pdf/SFFS832
- [S27] IPC-9592B table of contents — https://www.electronics.org/TOC/IPC-9592B.pdf
- [S28] TE Connectivity relay application notes (coil suppression, inrush, tack welding) — https://www.te.com/en/products/relays-and-contactors/electromechanical-relays/intersection/application-notes.html
- [S29] Omron, "What causes contact welding and what can be done about it?" — https://automation-knowledge-base.omron.eu/support/solutions/articles/103000352417-what-causes-contact-welding-and-what-can-be-done-about-it-
- [S30] CR4 forum, drop-off voltage of contactors (cites IEC 60947-4-1 clause 7.2.1.2) — https://cr4.globalspec.com/thread/77403/Drop-Off-Voltage-of-Contactors
- [S31] Gewiss datasheet GWD6520 (undervoltage release per IEC 60947-4-1) — https://gewiss.com/content/gewiss/al/en/products/product.datasheet.1000001.1000063.GWD6520.pdf
- [S32] US patent 6847515, contactor ride-through of supply variations — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6847515
- [S33] "Conductor creep and thermal cycling" — https://clouglobal.com/conductor-creep-and-thermal-cycling-why-copper-and-aluminium-connections-loosen-over-time/
- [S34] US patent 3944314, terminal for aluminium wire (oxide, thermal cycling) — https://patents.google.com/patent/US3944314A/en
- [S35] CR4 forum, arc-quenching relay for stabiliser tap switching (manufacturer statement) — https://cr4.globalspec.com/thread/75520/ARC-Quenching-Single-Pole-Double-Throw-Relay
- [S36] Jestine Yong, AC stabiliser repair — https://jestineyong.com/ac-stabilizer-repair/
- [S37] Jestine Yong, V-Guard V-G5 relay malfunction repair — https://jestineyong.com/malfunction-of-both-relays-solved-in-v-guard-voltage-stabilizer-v-g5/
- [S38] General Radio Experimenter, April 1953 (Variac failures at brush) — https://worldradiohistory.com/Archive-Company-Publications/Archive-General-Radio/GR%20Exp%201953_04.pdf
- [S39] Tesla coil mailing list, Variac brush material — https://pupman.com/listarchives/2017/Feb/msg00033.php
- [S40] Sinalda, "How often should I maintain my voltage stabiliser?" — https://www.sinalda.com/?p=31806
- [S41] IAEI Magazine, "PV systems math: sample calculations" — https://iaeimagazine.org/2019/2019september/pv-systems-math-sample-calculations
- [S42] Mike Holt forum, Voc vs Vmp and NEC 690.7 — https://forums.mikeholt.com/threads/voc-vs-vmp-in-string-sizing-temperature-coefficient-and-690-7.133065/post-2081183
- [S43] Victron community, overvoltage at battery output when BMS shuts down during charging — https://community.victronenergy.com/t/smartsolar-75-15-uberspannung-am-batterieausgang-wenn-bms-von-akku-beim-laden-abschaltet/61910
- [S44] onsemi AND90158, MOSFET avalanche in applications — https://www.onsemi.com/download/application-notes/pdf/and90158-d.pdf
- [S45] ROHM TechWeb, body diode reverse recovery and shoot-through — https://techweb.rohm.com/product/power-device/si/15318/
- [S46] Brooks, Sandia-EPRI connector presentation — https://energy.sandia.gov/wp-content/uploads/2024/08/Brooks-Sandia-EPRI-Connector-Presentation50.pdf
- [S47] pv magazine, "Cross-mating of connectors was chief cause of Netherlands PV fires" (TNO) — https://www.pv-magazine.com/2019/04/12/cross-mating-of-connectors-was-chief-cause-of-netherlands-pv-fires/
- [S48] Energy Safe Victoria, guide to identifying mismatched DC connectors (2022) — https://app.production.energysafe-vic-gov-au.sdp3.sdp.vic.gov.au/sites/default/files/2022-12/ESV_Guide_IdentifyingMismatchedDcConnectors_Nov2022.pdf ; also NREL PVQAT connector survey — https://nrel.gov/docs/fy24osti/87599.pdf ; PVEL/HelioVolta connector safety guide — https://www.pvel.com/wp-content/uploads/PVEL-HelioVolta-Ultimate-Safety-Guide-for-Solar-PV-Connectors-Feb-2022.pdf
- [S49] IAEI Magazine, "Metal oxide varistor degradation" (2004) — https://iaeimagazine.org/2004/march2004/metal-oxide-varistor-degradation/
- [S50] Bourns GMOV brochure (degradation and thermal runaway) — https://www.mouser.com/pdfDocs/GDT1902GMOVBrochure.pdf
- [S51] In Compliance, "New requirements for MOVs used for surge suppression on AC mains ports" — https://incompliancemag.com/new-requirements-for-movs-used-for-surge-suppression-on-ac-mains-ports/
- [S52] US patent 4903161 (MOV thermal runaway at about 25 mA standby current) — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4903161
- [S53] Littelfuse UltraMOV V14E175P datasheet (copy) — https://html.alldatasheet.net/html-pdf/585705/LITTELFUSE/V14E175P/1815/3/V14E175P.html
- [S54] NASA Earth Observatory, "Global lightning activity" (LIS/OTD 1995–2013) — https://earthobservatory.nasa.gov/images/85600/global-lightning-activity
- [S55] DEHN white paper (thermal disconnector, short-circuit failure mode) — https://www.dehn-africa.com/sites/default/files/media/files/aci-wpx045-en.pdf
- [S56] VIOX, SPD temporary overvoltage guide (vendor, secondary) — https://viox.com/my/spd-tov-temporary-overvoltage-guide-primary-keyword-temporary-overvoltage-spd/
- [S57] Gore, "Protective vents reduce condensation in sealed enclosures" — https://www.gore.com/resources/case-study-gorer-protective-vents-reduce-condensation-sealed-enclosures
- [S58] Gore, temperature cycling technical information — https://www.gore.com/sites/default/files/resources/pdf/2025-07/ptv-techinfo-temperature-cycling-us.pdf
- [S59] IPC technical paper E12&S09-02 (critical humidity for ECM) — https://www.electronics.org/system/files/technical_resource/E12%26S09_02.pdf
- [S60] Bahrebar S., PhD thesis, DTU CELCORR (2022) — https://celcorr.dtu.dk/-/media/subsites/celcorr/publications/sajjad-bahrebar-phd-thesis-22-7-22-w.pdf
- [S61] DTU, "Parametric study of interior climate in electronic device enclosures" — https://orbit.dtu.dk/en/publications/parametric-study-of-interior-climate-in-electronic-device-enclosu/
- [S62] "Surface failure mechanism of PCB-ENIG in typical outdoor atmospheric environments", Beihang Univ. — https://research.buaa.edu.cn/en/publications/surface-failure-mechanism-of-pcb-enig-in-typical-outdoor-atmosphe/
- [S63] "Calendar aging and post-mortem analysis of graphite/LiFePO4 cell" (HAL) — https://hal.archives-ouvertes.fr/hal-01228643
- [S64] Univ. of Waterloo thesis, "Calendar aging and lifetimes of LiFePO4 batteries" — https://uwspace.uwaterloo.ca/handle/10012/12177
- [S65] Slowik et al., J. Econ. Entomol. 89(2) 1996 (fire ants and electrical contacts) — https://academic.oup.com/jee/article/89/2/347/2216373
- [S66] MacKay et al., Environ. Entomol. 21(4) 1992 (fire ants and electric fields) — https://academic.oup.com/ee/article/21/4/866/417331
- [S67] Texas A&M AgriLife fact sheet FAPFS011 — https://research.entomology.tamu.edu/wp-content/uploads/sites/28/2013/02/FAPFS011_2007rev.pdf
- [S68] Cooling Post, "Ants behaving badly" — https://coolingpost.com/features/ants-behaving-badly
- [S69] Team-BHP forum, home appliance thread (Delhi supply swings, anecdotal) — https://www.team-bhp.com/forum/gadgets-computers-software/23174-home-appliance-thread-post2337853.html
- [S70] IEC 60721-3-3:2019 (new classes 3K20–3K24) — https://www.evs.ee/en/iec-60721-3-3-2019 ; IEC TS 60721-4-3 preview — https://www.vde-verlag.de/iec-normen/preview-pdf/info_iects60721-4-3{ed1.0}en.pdf

Standards named without a URL (IEC 60664-1, IEC 60947-1/-4-1/-6-1, IEC 61643-11/-12/-31/-32,
IEC 62305, IEC 60364-5-534, IEC 60068-2-x, IEC 60529, IEC 61000-4-5/-11, IPC-CC-830,
IPC J-STD-001, MIL-HDBK-217F) are paid documents; the values quoted from them here are the
commonly used ones and must be checked against the edition the project buys.

## 10. Known gaps

- No public component-level failure shares for off-grid inverters, stabilisers or
  change-over switches in tropical markets were found. The DFMEA occurrence ratings for
  categories 1, 2 and 4 must therefore come from physics of failure, handbook FIT values
  (SN 29500 / IEC 61709) and our own tests, not from field statistics.
- The exact pick-up/drop-out limits of IEC 60947-4-1 and the derating numbers of IPC-9592B
  Appendix A are not confirmed here (pay-walled); check them before they become requirements.
- Creepage values in FF-40 are indicative; read them from IEC 60664-1 tables for each working
  voltage.
- Gecko, termite, cockroach and rodent damage is well known from repair practice but no
  statistics were found.
