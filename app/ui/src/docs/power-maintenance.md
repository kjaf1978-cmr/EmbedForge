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
| Stabiliser | OUTPUT (green) | the load is connected | waiting for the restart delay (about 11 s) or cut off |
| Stabiliser | FAULT (red) | the 230 V tap is outside 190 … 255 V: the output protection holds the load off | output in range |
| Charger | CHARGING (green) | charge current above about 6 A flows | no or low charge current (night, weak sun, battery full) |
| Charger | FAULT (red) | the independent overvoltage protection has tripped (the output went above 60.5 V): the battery and the array are cut off until the power is removed | normal |

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
90 °C), FAULT LED (overvoltage latch: switch the battery and PV off for 1 minute), PV polarity
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

**How long does a unit last?** The predicted MTBF at 45 °C is 70 to 116 years for random
failures (Reliability tab in the app); in practice the installation (terminals, water,
insects, surges) decides, which is why the inspections above matter.
