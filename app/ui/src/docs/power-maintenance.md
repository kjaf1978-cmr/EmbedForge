# Power designs: diagnostics, maintenance and repair

This page belongs to the worked power examples (start screen, advanced examples): the mains
change-over (single-phase and 3P+N), the voltage stabiliser and the MPPT solar charger. It
says what their indicator LEDs mean, which maintenance is planned, how to find a fault, and
answers frequent questions. Type a word in the help search (for example *FAULT*, *relay*,
*battery*, *chatter*) to find the right answer.

**Safety first.** These products work at mains voltage or at battery currents of up to 100 A.
Switch off and lock out every source (mains, back-up, PV array, battery) and wait 1 minute
before opening the enclosure. Measure that no voltage is present before touching anything.
Work on the PV side only with the DC isolator open: a PV array is live whenever there is
daylight.

## Diagnostics: what the LEDs say

| Design | LED | On means | Off means |
|---|---|---|---|
| Change-over | ON MAINS (green) | the mains contactor K1 is closed | the load is not on the mains |
| Change-over | ON BACK-UP (yellow) | the back-up contactor K2 is closed | the load is not on the back-up |
| Change-over | OVERVOLTAGE (red) | a phase of the mains is above 253 V (or, after a trip, above 245 V) | no overvoltage |
| Change-over | UNDERVOLTAGE (red) | a phase is below 195 V, missing, or more than about 10 % below the others (3P+N) | no undervoltage |
| Stabiliser | one yellow LED per tap relay | that relay is energised; the lowest LED that is on is the tap in use | — |
| Stabiliser | OUTPUT (green) | the load is connected | waiting for the restart delay (about 8 s) or cut off |
| Stabiliser | FAULT (red) | the 230 V tap is outside 190 … 255 V: the output protection holds the load off | output in range |
| Charger | CHARGING (green) | charge current above about 6 A flows | no or low charge current (night, weak sun, battery full) |
| Charger | FAULT (red) | the independent overvoltage protection has tripped (the output stayed above 57.6 V, 3.6 V per cell): the battery and the array are cut off until the array's voltage disappears (at night, or with the PV isolator open for 1 minute); with a fault that persists it trips again at the next start | normal |

Normal states: change-over with healthy mains: only ON MAINS. Change-over on generator: ON
BACK-UP, and one red LED telling why the mains was rejected. Stabiliser: one or more yellow
LEDs and OUTPUT. Charger by day: CHARGING; at night: all off.

## Planned maintenance

The designs need no replacement of parts on a schedule within their life (see
RELIABILITY.md in the project documentation). Only these inspections are planned:

**Yearly (every design, about 5 minutes):**

1. Look at the LEDs in operation: they must show a normal state (table above).
2. Look at the varistors' indicators (or measure their leakage at 230 V: below 0.1 mA).
   Replace a varistor that shows end of life, and after a lightning strike nearby.
3. Look for insects, nests, dust or water inside; clean with dry compressed air; check that
   the membrane vent, mesh and cable glands are intact.
4. Check the terminals for discolouration; re-tighten to the torque on the label.
5. Charger: clean the heatsink fins; check the NTC sensor cable on the battery.

**Every 5 years (change-over):** inspect the contactor contacts (burn marks, contact
resistance below 1 mΩ per pole at 10 A).

## How to find a fault

1. **Read the LEDs** and compare with the table. Most faults are outside the unit: a missing
   source, a tripped breaker, a battery cut off by its BMS.
2. **Check the supplies:** the 24 V (change-over) or 12 V (stabiliser, charger) control supply.
   Below 20 V the change-over opens both contactors on purpose (coil-supply lockout).
3. **Check the inputs with a meter:** mains and back-up voltage on every phase (change-over,
   stabiliser), PV voltage and polarity (charger: the open-circuit voltage must be below
   120 V), battery voltage and polarity.
4. **Compare with the simulation:** open the example in the app, set the sources to the
   measured values and simulate. The probes show what each node should measure. A node that
   differs locates the fault.
5. **Replace like with like:** the parts list (Parts tab) gives the exact type. A substitute
   must have at least the same ratings (the stress check in the app compares them) and, for
   power semiconductors, the same heatsink mounting. Re-run the end-of-line test of the design
   after a repair.

## FAQ

**The change-over does not go back to the mains after an outage.** It waits about 10 s after
the mains is healthy again (return delay), and after an over- or undervoltage it returns only
when the mains is back inside 205 … 245 V (hysteresis). Both are intended.

**Both contactors seem to drop briefly at every transfer.** That is the dead time (about
0.5 s) between one contactor opening and the other closing, so that the two sources can never
be connected together and motors run down first.

**The contactors chatter.** Normally impossible: the coil supply has a lockout below 20 V and
the thresholds have hysteresis. Check the 24 V supply and its terminals; replace the
contactor if its coil is open or shorted.

**The change-over rejects a three-phase mains that looks fine.** One phase is more than about
10 % below the highest (asymmetry), or a phase or the neutral is missing. Measure each phase
to neutral, not between phases. A lost neutral can make one phase rise towards 400 V.

**The stabiliser output stays off and FAULT is on.** The 230 V tap is out of range: the input
is outside about 140 … 300 V, or a tap relay is stuck. The yellow LEDs show which relays are
on; with the input known, the right tap follows from the table in the example's notes. A
relay whose LED is on although it should be off has a shorted driver transistor (BD139) or a
welded contact.

**The stabiliser clicks often.** Each click is a tap change: the input voltage moves across a
step (160, 180, 200, 220, 240 or 265 V). The hysteresis is about 3 V. Frequent clicks mean a
very unstable supply; the 30 A relays are rated for more than 4 million changes.

**The charger does not charge although the sun is shining.** Check in order: battery
temperature (no charging below 0 °C or above 50 °C), heatsink temperature (stop above
90 °C), FAULT LED (overvoltage latch: open the PV isolator for 1 minute; the control is supplied from the array, so the latch also resets at night), PV polarity
and voltage, battery fuse (100 A). An open or shorted battery temperature sensor also stops
the charging, on purpose.

**The charger delivers less than expected.** It takes the array's maximum power (within about
3 %) at any temperature; less power means less sun, dirty or shaded modules, or a hot array
(about −0.3 % per °C). Every 10 s it pauses for 50 ms to measure the open-circuit voltage:
that is normal.

**Can I connect the battery or the array the wrong way round?** It does not damage the
charger: the array is blocked by QPV, the battery by QB2 (and the 100 A fuse). Correct the
wiring; no repair is needed.

**What happens if the battery's BMS disconnects during charging?** The output is stopped
within one switching period and held below 62 V; the charger restarts by itself when the
battery is back.

**May I connect several chargers to one battery?** Yes: each with its own array; their
outputs are blocked against reverse current, so units share the battery without
interaction. Size them from the table in the example's notes.

**Which parts wear out?** Only contacts (contactors, relays) and varistors, slowly; see
"Planned maintenance". Film capacitors are used where electrolytics would dry out in a hot
climate.

**How long does a unit last?** The predicted MTBF at 45 °C is 80 to 115 years for random
failures (Reliability tab in the app); in practice the installation (terminals, water,
insects, surges) decides, which is why the inspections above matter.

## Agricultural and machinery designs (P9)

**Safety first.** The pump controller, the block machine's panel and the 240 V grinder drive
work at mains voltage; on the 240 V grinder drive the whole control board, the speed pot and
the buttons are at mains potential (the control is not isolated). The trimmer, the gate and
the 24 V grinder drive carry battery currents of up to 200 A. Switch off and lock out every
source and wait 1 minute before opening an enclosure; a motor that turns generates voltage.

| Design | LED or sign | Means |
|---|---|---|
| Pump controller | RUN (green) | the pump's contactor is on |
| Pump controller | FAULT (red) | latched: the OVERFLOW electrode was reached (a HIGH electrode or the contactor failed) or the pump ran longer than 2.3 hours (a burst pipe, a pump that no longer delivers); switch off and on to reset after the repair |
| Pump controller | SOURCE DRY (yellow) | the DRY electrode is out of the water: the pump is held off until 8.5 minutes after the water is back |
| Irrigation | FAULT (red, main board) | the overcurrent cut-off holds every valve off (a shorted valve or cable, or the power-up state until the firmware clears it) |
| Gate controller | — | the cut-off (short circuit or obstacle) is reported to the Nano, which reverses briefly and waits |
| Trimmer | FAULT (red) | a jam, the battery below 27.5 V or a temperature above 85 °C: release the trigger to reset |
| Block machine | SAFETY RAIL (green) | K1 and K2 are on: the machine may move; off after an E-stop until RESET |
| Grinder drive | RUN (green) | K1 and the main contactor are on |
| Grinder drive | FAULT (red) | stall (the torque limit held about 3 s), overload (above 115 % for about 20 s), heatsink above 85 °C, or on 24 V the battery below 21 V: press START again once the cause is removed |

**Planned maintenance (yearly):** check the E-stop and every limit switch, beam and guard
switch for function (the gate must stop on the beam, the block machine on each E-stop and
guard); check the contactor contacts of the block machine and the grinder (burn marks); clean
the heatsinks; on the grinder, check the motor's brushes (replace below 8 mm or as the motor's
maker says) and the reversing switch; on the irrigation controller, test each zone and look
at the ribbon cable and its connectors.

**The grinder does not start.** START only works with the E-stop and STOP released, the
motor's thermal switch closed (a hot motor needs about 20 minutes) and, on 240 V, the
reversing switch in FWD or REV (its middle position opens the run chain on purpose). After a
power cut, a STOP or a fault, START must be pressed again: the drive never restarts by
itself.

**Settings of the grinder drive per machine.** Set with the five trimmers on the control
board, the drive switched off first (the 240 V board is live). Turn the speed pot fully up,
start, and set MAX with a tachometer on the tool; then MIN with the pot fully down; IR COMP
until the speed no longer drops under load (too much makes it hunt); ACCEL for the start
time; CURRENT LIMIT last.

| Machine | Transmission | MAX | MIN | ACCEL | CURRENT LIMIT | Notes |
|---|---|---|---|---|---|---|
| Angle grinder (disc) | belt up, e.g. 1 : 2.5 | the disc's rated speed, never above (its label) | 30 % | 2 s | 120 % | wheel guard; no reversing |
| Bench grinder | direct, 3000 rpm | the wheel's rated speed (above 3000 rpm needs a wheel rated for it) | 30 % | 2 s | 120 % | tool rests within 2 mm of the wheel |
| Grain or maize mill | belt or gearbox down to 300 … 1000 rpm | the mill maker's speed | 20 % | 5 s | 150 % | start empty when possible; the stall trip catches a choked mill |
| Meat mincer | gearbox down to 150 … 250 rpm | the mincer maker's speed | 10 % | 1 s | 150 % | REV (240 V) to clear a jam: stop, wait for standstill, switch, START |

**The grinder trips FAULT under heavy load.** Stall: the load needed the full torque for 3 s
(a choked mill, a jammed mincer); clear it and restart. Overload: the motor ran above 115 %
of its rated current for 20 s; reduce the feed or raise the transmission's ratio. Heatsink:
clean the fins and check the fan.

**Can the grinder's speed drop under load?** A few per cent with IR COMP set right; more
means the current limit acts (the load needs more torque than CURRENT LIMIT allows) or IR
COMP is too low.
