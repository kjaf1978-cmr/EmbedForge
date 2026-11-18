# Gate controller (P9): user manual

A controller for an electrically operated sliding or swing gate with one 24 V DC gear motor (up
to about 100 W), worked by an infrared remote control or a push-button / key-switch.

> **Safety.** A moving gate can crush and trap. The installation must meet the local rules for
> powered gates (in the EU, EN 12453 and EN 12604), with the photo-beam fitted and the force
> limit checked at commissioning. Keep children away from the gate and the remote. This controller
> has not been certified, its safety functions have not been assessed for the performance levels
> the standard requires, and no prototype has been built yet (TYPE_TESTS.md).

## 1. What it does

- **One button.** Each press of the remote's button (or the push-button / key-switch): a closed
  gate opens; an open gate closes; a moving gate stops; a stopped gate moves the other way from
  its last move.
- **End positions.** A limit switch at each end stops the motor; the stop works without the
  controller's program (the switches are in the relays' coils).
- **STOP.** A STOP button (if fitted) stops the gate at once, in hardware; nothing moves while it
  is pressed.
- **Photo-beam.** Before every close the controller tests the photo-beam (it switches the beam's
  transmitter off and on and checks the receiver sees it): a beam that fails the test keeps the
  gate from closing. If something breaks the beam while the gate is closing, the gate stops at
  once (in hardware) and opens again fully. A close is not started while the beam is broken.
- **Obstacle.** If the gate meets an obstacle (the motor's current above about 7 A: within 0.1 s
  at a hard stall, longer at a light one), the motor stops at once (in hardware). While closing,
  the gate then opens fully; while opening, it moves back for half a second to release what it
  pressed on. At the third obstacle without reaching an end it moves back for half a second, then
  stays stopped until the next press (which opens it).
- **Running too long.** A move that has not reached its end after 60 s stops.
- **After a power cut.** Nothing moves until a press; the first press opens (if the gate is
  already fully open, the first press does nothing and the next one closes it).
- **Braking.** When the motor stops, its terminals are shorted: the gate stops quickly and is held
  against light pushing.

## 2. The remote

Most simple infrared remotes that use the NEC protocol work. To pair a remote (up to four; a fifth
replaces the oldest), hold the LEARN button on the board (the electrician) and press the remote's
button: the controller's LED flashes three times. A lost remote: hold LEARN for 10 s to erase every
pairing, then pair the remaining remotes again.

**An infrared remote is a convenience, not a lock.** Its code can be copied by a learning remote
held near it, and the receiver needs line of sight. Where the gate secures a property, use the
key-switch input (a key-switch outside, wired by the electrician) or add a radio remote with
rolling codes (not part of this controller).

## 3. Indicators

On the board (seen with the enclosure open, or through its window):

| What you see | Meaning | What to do |
|---|---|---|
| The program LED flashes briefly every second | normal | — |
| It flashes twice every second | three obstacles (press: it opens), or the photo-beam failed its test | press again; if it does not close: check the beam's alignment and lenses, then the electrician |
| It is lit steadily | STOP pressed (or LEARN held) | release STOP |
| The red CUT-OFF LED is lit | the cut-off has tripped (an obstacle) | it clears at the next move |
| The gate does not move when pressed | STOP pressed, a broken beam (closing), no supply, or the remote not paired | check STOP, the beam and its alignment, the supply; then the electrician |
| The gate stops and reverses by itself | an obstacle or the beam | remove the cause |
| The gate stops before its end often | the gate is stiff (rails, hinges), or the motor is weak | the electrician (maintenance) |

## 4. Maintenance

**Every year (electrician or the gate's maintainer):**

- Clean and grease the gate's rails or hinges (a stiff gate trips the obstacle cut-off).
- Clean the photo-beam's lenses. Check the photo-beam (break it while closing: the gate reopens)
  and the force limit (COMMISSIONING.md section 5).
- Check the limit switches stop the gate at both ends, and STOP stops it.

## 5. Technical data

| | |
|---|---|
| Supply | 24 V DC, at least 10 A (240 W), a DIN-rail supply; fused 10 A on the board |
| Motor | 24 V DC gear motor up to about 100 W (2.6 A running, 12 A stalled in the design model) |
| Obstacle cut-off | above about 7 A (6.1 … 7.9 A with the comparator's tolerance) through a 0.1 s filter: 0.1 s at 12 A, 0.27 s at 7.5 A; blanked for about 0.1 s at each start; short circuit above 25 A within microseconds. A trip also drops both relays. |
| Travel time limit | 60 s |
| Remote | infrared 38 kHz, NEC protocol, up to four paired |
| Inputs | open limit, close limit, photo-beam, STOP (normally closed contacts, 24 V); push-button / key-switch (normally open, to 0 V) |
| Output | the photo-beam transmitter's supply, 24 V, up to 100 mA (switched for its test) |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
