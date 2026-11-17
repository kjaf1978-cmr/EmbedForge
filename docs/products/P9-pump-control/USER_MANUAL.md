# Pump controller (P9): user manual

An automatic controller for a borehole pump or a transfer pump (230 V single-phase, up to
1.5 kW) that fills an elevated tank. It needs no programming and has no microcontroller.

> **Safety.** The controller is connected to the mains. It must be installed and serviced by a
> qualified electrician, following the local wiring rules. Its electrodes are in the water, so its
> control circuit is protection extra-low voltage (PELV), separated from the mains by a safety
> transformer and relays with reinforced insulation: do not modify the wiring or replace a part
> with another type. It has not been certified, and no prototype has been built yet
> (TYPE_TESTS.md).

## 1. What it does

Stainless electrode rods hang in the tank (LOW, HIGH, OVERFLOW and a common rod) and in the
source, the borehole or the ground tank (DRY and a common rod).

- **Normal filling.** The pump starts when the water falls below the LOW rod and stops when it
  reaches the HIGH rod.
- **Overflow.** If the water reaches the OVERFLOW rod, the pump stops and the controller locks
  out (red FAULT LED) until someone presses RESET. A second, independent circuit also stops the
  pump at OVERFLOW, even if the main control has failed.
- **Source dry.** When the water leaves the DRY rod, the pump stops within about a third of a
  second (yellow LED). After the water has come back, the pump waits 8.5 minutes before it may
  start again, so the borehole can recover. The independent circuit also stops the pump when the
  source is dry.
- **Maximum run time.** If the pump runs for more than 2.3 hours without the tank filling (a
  burst pipe, a pump that no longer delivers), it stops and the controller locks out (FAULT).
- **After a power cut.** The controller waits 8 s before the pump may start. It does not wait the
  8.5 minutes unless the source was dry before.
- **Electrodes.** The rods are fed with a small alternating voltage (200 Hz), so they do not
  corrode or scale from electrolysis. A broken electrode cable reads as "dry": a broken LOW cable
  starts the pump (it still stops at HIGH); a broken HIGH cable lets OVERFLOW stop it (FAULT).

## 2. Indicators and button

| Indicator | Meaning |
|---|---|
| RUN (green) | the pump is commanded on |
| SOURCE DRY (yellow) | the DRY rod is out of the water |
| FAULT (red) | the controller is locked out: the tank reached OVERFLOW, or the pump ran too long |
| RESET (button) | clears FAULT once the cause has been found |

| What you see | Meaning | What to do |
|---|---|---|
| Green on, tank filling | normal | nothing |
| Yellow on, pump stopped | the source is dry | wait: the pump restarts 8.5 min after the water returns. If it happens often, the pump draws more than the borehole gives |
| Red on, pump stopped | overflow or too long a run | look for the cause: a HIGH rod or cable, a burst pipe, a pump that no longer delivers. Then press RESET |
| Nothing on | no supply, a breaker or fuse open | check the breaker; then the electrician |

## 3. Maintenance

**Every year (electrician):**

- Pull the electrodes, clean the rods (scale and slime), check their cables.
- Check the motor-protective breaker's setting against the pump's rating plate.
- Repeat the function checks of COMMISSIONING.md section 4 (start, stop, overflow, dry).

## 4. Technical data

| | |
|---|---|
| Supply | 230 V ~ 50 Hz |
| Pump | single-phase 230 V, up to 1.5 kW; contactor 9 A AC-3 (L and N); motor-protective breaker 6 … 10 A, set to the pump |
| Electrodes | stainless rods; AC excitation 200 Hz; wet up to about 25 kΩ (water and cable) |
| Times | start delay 8 s; dry lockout 8.5 min; maximum run 2.3 h |
| Control circuit | PELV (safety isolating transformer IEC 61558-2-6; interface relays with reinforced insulation) |
| Protection class | I |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
