# Technical reference: device models

Every part on the schematic is turned into primitive elements by `eda/simnet.ts`. Resistors,
capacitors, inductors and sources are primitives themselves; semiconductors use SPICE device
equations; integrated circuits, transformers and motors are *macro models* built from
primitives; a few parts are behavioural. V_T = kT/q ≈ 25.9 mV at 27 °C; at another circuit
temperature T every equation below uses V_T(T) and the temperature-adjusted parameters given in
the last section, Temperature.

## Diode, LED, Zener

The SPICE diode equation with series resistance R_S (an internal node) and reverse breakdown:

    forward and small reverse (v ≥ −3·n·V_T):  i = I_S·(e^(v/(n·V_T)) − 1)
    reverse:                                    i = −I_S·(1 + (3·n·V_T/(e·v))³)
    breakdown (v < −BV):                        i = −I_S·e^(−(BV + v)/(n·V_T))

A conductance GMIN = 10⁻¹² S is added in parallel, as in SPICE. LEDs are diodes whose I_S is
chosen so that their forward voltage at 20 mA is the colour's typical value (n = 1.9,
R_S = 5 Ω).

Rectifier diodes (1N4007) and bridge rectifiers have a constant junction capacitance C_J
(datasheet typical values: 15 pF for the 1N4007 and DB107, 25 pF for the KBP206, 55 pF for the
GBU8K) across the junction, inside R_S; it is exported as CJO with M = 0, which SPICE also takes
as constant. It keeps the diode's off state capacitive, as it is: when a bridge fed by a
transformer stops conducting, the transformer's leakage inductance rings with it instead of
facing an open circuit. A power-on start (capacitors discharged) does not hold C_J at 0 V; it
starts at the junction voltage of the first solution. Other diodes have no junction
capacitance.

@code sim/engine.ts Diode.eval

## Bipolar transistor

The transport form of the Gummel–Poon model without charge storage and high injection
(equivalent to Ebers–Moll with the Early effect):

    I_be = I_S·(e^(V_be/(N_F·V_T)) − 1)      I_bc = I_S·(e^(V_bc/(N_R·V_T)) − 1)
    1/q_b ≈ 1 − V_bc/VAF − V_be/VAR
    I_C = (I_be − I_bc)/q_b − I_bc/B_R        I_B = I_be/B_F + I_bc/B_R

The function also returns the four partial derivatives the Newton–Raphson iteration and the AC
analysis need. PNP transistors use the same equations with all voltages and currents negated.

@code sim/engine.ts Bjt.eval

## MOSFET (level 1, Shichman–Hodges)

With β = KP·W/L and V_gst = V_gs − V_TO:

    cut-off     (V_gst ≤ 0):              I_D = 0
    triode      (V_ds < V_gst):           I_D = β·(1 + λ·V_ds)·V_ds·(V_gst − V_ds/2)
    saturation  (V_ds ≥ V_gst):           I_D = (β/2)·(1 + λ·V_ds)·V_gst²

A body diode from source to drain is included. For V_ds < 0 source and drain swap roles.
Power-MOSFET models are level-1 fits to the threshold voltage and on-resistance.

@code sim/engine.ts Mosfet.ids

## Imported SPICE models

A pasted `.model` line is read by `eda/spicemodel.ts`. SPICE numbers are parsed with SPICE's
suffixes (M = milli, MEG = mega). The parameters above are used, with XTI and EG for the
temperature; parameters for effects the simulator does not model (CJO, which SPICE makes voltage-dependent,
TT…) are listed as ignored.

@code eda/spicemodel.ts spiceValue

@code eda/spicemodel.ts importModel

## Protection, power and interface parts

**TVS diode.** A diode junction with reverse breakdown at the nominal breakdown voltage V_BR
(at 10 mA) and a series resistance R_S = (V_C − V_BR)/I_PP from the datasheet's clamping
voltage V_C at the peak pulse current I_PP. A bidirectional type is two junctions in
anti-series; each breaks down 0.6 V below V_BR (the other conducts forward) and carries R_S/2.

@code eda/models.ts tvsJunction

**Bridge rectifier:** four identical diodes, ~1 → +, ~2 → +, − → ~1, − → ~2.

**IGBT.** The equivalent circuit of the device: an N-channel MOSFET (gate G, source at the
emitter) whose drain current is the base current of a wide-base PNP (emitter at the collector
C, collector at the emitter E). The collector current is (1 + β_PNP)·I_MOS, and

    V_CE(sat) = V_EB(PNP) + V_DS(MOS)

The MOSFET's V_TO is the datasheet gate threshold and its K_P is chosen so that V_CE(sat) at
the rated current with V_GE = 15 V matches the datasheet; the short-circuit current then comes
out at about four to five times the rated current, as in real devices. Without a co-packed
diode the IGBT blocks in reverse (the PNP's emitter junction); models with a diode add it from E
to C.

**Optocoupler.** The infrared LED (1.2 V at 20 mA) in series with a 1 Ω current sense; a
voltage-controlled current source puts CTR/β·I_F into the base of the phototransistor (β = 500),
so I_C = CTR·I_F until the transistor saturates. The two sides share no node.

**TL431 shunt reference.** An error amplifier (transconductance 1 mS into 10 MΩ: gain 10⁴)
compares REF with V_ref above the anode; its output is clamped between the anode and 2.5 V
above it, buffered, and drives an NPN (β = 100) through 1 kΩ from the cathode to the anode. The
loop gain is about 1000 A/V, so REF stays within about 0.1 mV of V_ref from 1 to 100 mA. A
diode from anode to cathode conducts in reverse. The macro model is kept at 27 °C (the real
part is temperature-compensated).

**NTC thermistor:** R(T) = R₂₅·exp(B·(1/T − 1/298.15 K)) at the circuit temperature T.

**Fuse:** its cold resistance; whether it blows is the stress check's comparison of the RMS
current over the run with the rated current.

## Op-amp (macro model)

    input:   R_in between + and −
    gain:    G1 = g_m·(v₊ − v₋) into R1 = A/g_m       → DC gain A
    pole:    C1 across R1, f_p = GBW/A                  → gain–bandwidth GBW
    limits:  two sharp clamp diodes (N = 0.1) to the supply rails, offset by the output swing
    output:  unity buffer E and R_out

The output stops at the model's swing from each rail (LM358: 1.5 V below V+, 0.1 V above V−).
Supply current is not modelled.

## Linear regulators

A reference V_ref above the ground pin, a transconductance error amplifier (0.1 S) driving an
NPN pass transistor, and a dropout clamp that keeps the base below IN − dropout + one diode
drop. The quiescent current is a resistor (fixed types) or the ADJ current (LM317, whose
output stays 1.25 V above ADJ). No current limit or thermal model.

## Transformers

Two inductors coupled by a mutual inductance M = k·√(L_p·L_s), with L_s = L_p·n² for a turns
ratio n, and winding resistances. In the transient, the coupled inductors' branch equations
get the term M·di/dt of the other winding (same integration method); in AC, −jωM.

@code sim/engine.ts Mutual

A **three-phase transformer** is three such winding pairs. In delta, winding i lies between
line i and line i+1 and carries the line voltage; in star, between line i and the neutral, and
carries the line voltage / √3. The turns ratio follows from the winding voltages. Dyn and Yd
connections shift the phase by 30°.

## Relay

The coil is a 0 V current sense, its resistance and its inductance. Each contact is a
current-controlled switch with hysteresis (SPICE `W`, `CSW` model): it closes above
I_T + I_H = 75 % and opens below I_T − I_H = 25 % of the nominal coil current. The contact
state is a discrete state (see the engine page).

@code sim/engine.ts CSwitch

## Motors

**DC motor:** the mechanical side is written as a circuit with the speed ω as a voltage
(1 V = 1 rad/s):

    electrical:   V = R_a·i + L_a·di/dt + k·ω         (back-EMF k·ω: source E)
    mechanical:   J·dω/dt = k·i − B·ω − T_load       (torque k·i: source G into node ω;
                                                        inertia J: capacitor; friction B: conductance)

The speed pin gives ω·60/(2π)/1000 V (1 V per 1000 rpm) through 100 Ω.

**Induction motors:** per phase the standard equivalent circuit at the set slip s: stator
resistance R_s and leakage inductance, magnetising inductance L_m, rotor leakage inductance and
R_r/s. The three-phase motor is three such circuits in star.

**Servo (behavioural):** the high time of each pulse on PWM (above 1.5 V) sets the target angle
−90° … +90° for 1.0 … 2.0 ms; the angle moves towards it at the set speed.

@code sim/engine.ts Servo.accept

## 555 timer and logic (behavioural)

The **555** has the internal 5 kΩ divider, comparators at V_CTRL and V_CTRL/2, an RS latch
(reset below 0.7 V), an output 1.7 V below VCC or 0.1 V above GND through 10 Ω, and a 10 Ω
discharge transistor.

**Logic gates and the D flip-flop** are CMOS-like: an input is high above half the supply rail
(Schmitt inverter: 60 % rising, 40 % falling) and loads its node with 10 MΩ; an output connects
to the rail or ground through 50 Ω. The flip-flop takes D on a rising clock edge.

@code sim/engine.ts Logic.next

Behavioural parts have no SPICE primitive; the SPICE export writes a comment in their place.

## Sources

DC, sine, pulse and three-phase sources follow SPICE's SIN and PULSE definitions. A sine
source's delay is SPICE's TD: before it the source holds offset + amplitude·sin(phase).

@code sim/circuit.ts waveAt

## Temperature

Model parameters are given at the nominal temperature T_nom = 27 °C (300.15 K). At a circuit
temperature T (SPICE `.temp`) the engine adjusts them as ngspice does (`diotemp`, `bjttemp`,
`mos1temp`):

- **Thermal voltage:** V_T(T) = k·T/q.
- **Diode and bipolar saturation current:**

      I_S(T) = I_S · exp((T/T_nom − 1)·E_G/(N·V_T(T))) · (T/T_nom)^(XTI/N)

  with the band gap E_G = 1.11 eV and XTI = 3 unless the model sets them (Schottky diodes 0.69 eV
  and 2). A bipolar transistor uses N = 1 in this formula. At a fixed current the junction
  voltage then changes by about (V_j − E_G − XTI·V_T)/T per kelvin: −2 mV/K for a silicon diode
  at 1 mA. LED models get the band gap that gives their typical −2 mV/K.
- **Zener breakdown** is computed again from I_S(T), with the breakdown voltage itself fixed.
- **MOSFET (level 1, PHI = 0.6 V, GAMMA = 0):** KP(T) = KP·(T/T_nom)^−1.5 (mobility), and the
  threshold follows the silicon band gap E_g(T) = 1.16 − 7.02·10⁻⁴·T²/(T + 1108) and the surface
  potential: V_TO(T) = V_TO + ½·(E_g(T_nom) − E_g(T)) + type·½·(φ(T) − φ), about −1 mV/K. The body
  diode's I_S follows exp(E_g(T_nom)/V_T(T_nom) − E_g(T)/V_T(T)).
- **Resistors:** R(T) = R·(1 + TC1·ΔT + TC2·ΔT²) with ΔT = T − 27 °C; the property is TC1 in ppm/K.

@code sim/engine.ts satCurrent

@code sim/engine.ts mosAtTemp

The junctions inside macro models (the op-amp's output clamps, the regulator's pass transistor)
stay at 27 °C: the macro model is fitted to the datasheet behaviour, not to the physics of its
inner parts. The SPICE export writes `temp=27` on them, so ngspice does the same.
