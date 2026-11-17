# Pump controller (P9): user manual

An automatic controller for a borehole pump or a transfer pump (230 V single-phase, up to
1.5 kW) that fills an elevated tank. It needs no programming and has no microcontroller.

> **Safety.** The controller is connected to the mains. It must be installed and serviced by a
> qualified electrician, following the local wiring rules. Its electrodes are in the water, so its
> control circuit is safety extra-low voltage (SELV), separated from the mains by a safety
> transformer and relays with reinforced insulation, and not connected to earth: do not modify
> the wiring, do not connect the control to earth, and do not replace a part with another type. It
> has not been certified, and no prototype has been built yet (TYPE_TESTS.md).

## 1. What it does

Stainless electrode rods hang in the tank (LOW, HIGH, OVERFLOW and a common rod, COM) and in the
source, the borehole or the ground tank (DRY and a COM rod). Each COM rod is wired with two cores,
so the controller can check that it is connected.

- **Normal filling.** The pump starts when the water falls below the LOW rod and stops when it
  reaches the HIGH rod.
- **Overflow.** If the water reaches the OVERFLOW rod, the pump stops and the controller locks
  out (red FAULT LED) until someone presses RESET. A second, independent circuit with its own
  contactor also stops the pump at OVERFLOW, even if the main control or its contactor has
  failed.
- **Source dry.** When the water leaves the DRY rod, the pump stops within about a third of a
  second (yellow LED). After the water has come back, the pump waits about 8 minutes before it may
  start again, so the borehole can recover. The independent circuit also stops the pump when the
  source is dry.
- **A COM rod disconnected.** If either COM rod or its cable is disconnected, the independent
  circuit keeps the pump off (the levels could no longer be read).
- **Maximum run time.** If the pump runs for more than about 2.2 hours without the tank filling (a
  burst pipe, a pump that no longer delivers), it stops and the controller locks out (FAULT).
- **After a power cut.** The controller waits about 8 s before the pump may start. It does not wait
  the 8 minutes unless the source was dry before. (A very short dip, less than about half a
  second, may not restart the delay.)
- **Electrodes.** The rods are fed with a small alternating voltage (100 Hz), so they do not
  corrode or scale from electrolysis. A broken rod cable reads as "dry": a broken LOW cable starts
  the pump (it still stops at HIGH); a broken HIGH cable lets OVERFLOW stop it (FAULT); a broken
  DRY cable keeps the pump off with the yellow LED on.

## 2. Indicators and buttons

| Indicator | Meaning |
|---|---|
| RUN (green) | the pump is commanded on |
| SOURCE DRY (yellow) | the DRY rod is out of the water (or its cable is broken) |
| FAULT (red) | the controller is locked out: the tank reached OVERFLOW, or the pump ran too long |
| RESET (button on the door) | clears FAULT once the cause has been found |
| TEST (button on the board) | for the electrician only (commissioning) |

The motor-protective breaker Q1 shows its own state (its handle): if it has tripped, the pump has
been overloaded or blocked.

| What you see | Meaning | What to do |
|---|---|---|
| Green on, tank filling | normal | nothing |
| Yellow on, pump stopped | the source is dry, or the DRY cable is broken | wait: the pump restarts about 8 min after the water returns. If it stays on, call the electrician |
| Red on, pump stopped | overflow or too long a run | look for the cause: a HIGH rod or cable, a burst pipe, a pump that no longer delivers. Then press RESET |
| Nothing on, pump stopped, tank low | no supply, a fuse, or Q1 tripped | check the breakers and Q1; then the electrician |
| Green on, pump not running | the independent protection holds it off (a COM rod disconnected, overflow, dry) or Q1 tripped | the electrician |

## 3. Maintenance

**Every year (electrician):**

- Pull the electrodes, clean the rods (scale and slime), check their cables.
- Check Q1's setting against the pump's rating plate.
- Repeat the function checks of COMMISSIONING.md section 4, including the independent
  protection (4.4, 4.7, 4.8).

## 4. Technical data

| | |
|---|---|
| Supply | 230 V ~ 50 Hz |
| Pump | single-phase 230 V, up to 1.5 kW (up to 11 A); two contactors 18 A AC-3 in series (L and N); motor-protective breaker 9 … 14 A, set to the pump |
| Electrodes | stainless rods; AC excitation 100 Hz; wet up to about 15 kΩ (water and cable); cables up to about 10 nF between each rod's core and its COM core (TT-5 sets the length) |
| Times | start delay about 8 s; dry lockout about 8 min; maximum run about 2.2 h (± 20 %) |
| Control circuit | SELV (safety isolating transformer IEC 61558-2-6; interface relays with reinforced insulation; not earthed) |
| Protection class | I |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
