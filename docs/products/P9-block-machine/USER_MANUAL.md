# Block moulding machine (P9): user manual (the control)

The control of a machine that makes hollow and solid concrete blocks: a feeder box fills the
mould, two vibrators under the mould table compact the concrete while the hydraulic tamper head
presses, the mould lifts off the fresh blocks, and the pallet with the blocks is changed by the
operator.

> **Safety.** The machine can crush hands and arms in the mould, under the tamper and in the
> feeder's travel. Run it only with every guard closed and every E-stop working. Never reach into
> the mould area unless the main switch is off and locked with your own padlock. This control has
> not been certified; the machine's CE marking (its builder's) covers the whole machine
> (INSTALLATION.md section 4). No prototype has been built yet (TYPE_TESTS.md).

## 1. The controls

| Control | Where | What it does |
|---|---|---|
| Main switch | the panel's door | off: the whole machine without power; lock it with your padlock before any work in the machine |
| E-stop (red mushroom) | the operator's desk, and at the machine | stops every motion at once. Turn to release it, then press RESET |
| RESET (blue) | the operator's desk | after an E-stop or a guard was opened: switches the machine's control on again (on releasing the button). Nothing moves on RESET alone |
| START | the operator's desk | homes the machine, or runs one cycle |
| STOP | the operator's desk | stops the cycle at once (everything off); the next START homes the machine |
| Lamp READY / FAULT | the panel's door | see section 3 |
| Green lamp (on the board) | inside the panel | the safety rail is on (RESET given) |

## 2. Working

1. Main switch on; every guard closed; every E-stop released. Press RESET.
2. Put an empty pallet in place. Press START: the machine homes (the tamper up, the feeder home,
   the mould down onto the pallet). The lamp is on: READY.
3. Press START: one cycle. The feeder fills the mould with the vibrators running, the tamper
   presses, the vibrators compact the blocks for 4 s, the mould lifts while the tamper holds the
   blocks, the tamper lifts. The lamp flashes slowly while it works.
4. Take out the pallet with the fresh blocks and put an empty one in. The mould comes down onto
   it: READY again. Press START for the next cycle.

The hydraulic pump stops after a minute without work and starts again at the next START.

## 3. The lamp, and faults

| Lamp | Meaning | What to do |
|---|---|---|
| on | READY | START for a cycle |
| flashing slowly | homing, a cycle running, or waiting for the pallet change | — |
| flashing fast | FAULT: a step did not reach its position in time (a sensor, a stuck cylinder or feeder), a motor breaker tripped, the oil is hot, no working pressure, or an output fault | press STOP; find and remove the cause (below); press START: the machine homes |
| off | the control is off: an E-stop pressed, a guard open, RESET not given, STOP pressed, or not homed yet | release the E-stop, close the guard, press RESET, then START |

| Cause | Look at |
|---|---|
| a position not reached | the sensor (its LED), the cylinder or feeder (jammed concrete), the hydraulic oil level |
| a motor breaker tripped | the breaker in the panel (its handle); the motor and its cable. Reset the breaker only after the cause is known (the electrician) |
| hot oil | let the oil cool; check the oil level, the cooler, the relief valve's setting |
| no working pressure | the pump, the relief valve, a leak |
| an output fault (the lamp flashes again at once after STOP and START) | the electrician: a short in a valve's or a contactor's wiring, or an output on the board |

## 4. Daily and periodic checks

- **Daily, before work:** each E-stop: press it while the machine runs: everything stops; it
  does not restart when released, only after RESET. Each guard: open it while running: the same.
- **Weekly:** the sensors' faces clean; the valve plugs and cables undamaged; no oil leaks.
- **Every 6 months (the electrician):** the stopping time (COMMISSIONING.md 5.6), the safety
  relays' and contactors' function (COMMISSIONING section 4), the tightness of the panel's
  terminals.

## 5. Technical data

| | |
|---|---|
| Supply | 400 V 3-phase 50 Hz, about 30 A (main breaker C 32 A); PE |
| Motors | hydraulic pump 7.5 kW, mixer / feeder 3 kW, two vibrators 1.5 kW each |
| Control | 24 V DC (0 V on PE), an Arduino Mega 2560 |
| Safety | E-stop and guards on certified safety relays, two safety contactors feeding every coil and valve; monitored manual reset |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
