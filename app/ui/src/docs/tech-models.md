# Technical reference: device models

Every part on the schematic is turned into primitive elements by `eda/simnet.ts`. Resistors,
capacitors, inductors and sources are primitives themselves; semiconductors use SPICE device
equations; integrated circuits, transformers and motors are *macro models* built from
primitives; a few parts are behavioural. V_T = kT/q ≈ 25.9 mV at 27 °C.

## Diode, LED, Zener

The SPICE diode equation with series resistance R_S (an internal node) and reverse breakdown:

    forward and small reverse (v ≥ −3·n·V_T):  i = I_S·(e^(v/(n·V_T)) − 1)
    reverse:                                    i = −I_S·(1 + (3·n·V_T/(e·v))³)
    breakdown (v < −BV):                        i = −I_S·e^(−(BV + v)/(n·V_T))

A conductance GMIN = 10⁻¹² S is added in parallel, as in SPICE. LEDs are diodes whose I_S is
chosen so that their forward voltage at 20 mA is the colour's typical value (n = 1.9,
R_S = 5 Ω). Junction capacitance is not modelled.

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
suffixes (M = milli, MEG = mega). The parameters above are used; parameters for effects the
simulator does not model (CJO, TT, temperature coefficients…) are listed as ignored.

@code eda/spicemodel.ts spiceValue

@code eda/spicemodel.ts importModel

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

DC, sine, pulse and three-phase sources follow SPICE's SIN and PULSE definitions:

@code sim/circuit.ts waveAt
