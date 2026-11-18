# Gate controller (P9): user manual

A controller for an electrically operated sliding or swing gate with one 24 V DC gear motor (up
to about 100 W), worked by an infrared remote control.

> **Safety.** A moving gate can crush and trap. The installation must meet the local rules for
> powered gates (in the EU, EN 12453 and EN 12604), with the photo-beam fitted and the force
> limit checked at commissioning. Keep children away from the gate and the remote. This controller
> has not been certified, and no prototype has been built yet (TYPE_TESTS.md).

## 1. What it does

- **One button.** Each press of the remote's button: a closed gate opens; an open gate closes; a
  moving gate stops; a stopped gate moves the other way from its last move.
- **End positions.** A limit switch at each end stops the motor; the stop works without the
  controller's program (the switches are in the relays' coils).
- **Photo-beam.** If something breaks the beam while the gate is closing, the gate stops at once
  (in hardware) and opens again fully. A close is not started while the beam is broken.
- **Obstacle.** If the gate meets an obstacle (the motor's current above about 7 A for 0.1 s), the
  motor stops at once (in hardware). While closing, the gate then opens fully; while opening, it
  moves back for half a second to release what it pressed on. After three obstacles without
  reaching an end, the gate stays stopped until the next press (which opens it).
- **Running too long.** A move that has not reached its end after 60 s stops.
- **After a power cut.** Nothing moves until the remote is pressed; the first press opens.
- **Braking.** When the motor stops, its terminals are shorted: the gate stops quickly and is held
  against light pushing.

## 2. The remote

Most simple infrared remotes that use the NEC protocol work. To pair a remote (up to four), hold
the LEARN button on the board (the electrician) and press the remote's button.

**An infrared remote is a convenience, not a lock.** Its code can be copied by a learning remote
held near it, and the receiver needs line of sight. Where the gate secures a property, add a
key-switch or a radio remote with rolling codes (not part of this controller).

## 3. Indicators

The Nano's own LED shows the program is running (it is powered). The gate's state is seen at the
gate.

| What you see | Meaning | What to do |
|---|---|---|
| The gate does not move when pressed | a broken beam (closing), three obstacles (press again: it opens), no supply, or the remote not paired | check the beam and its alignment, the supply; then the electrician |
| The gate stops and reverses by itself | an obstacle or the beam | remove the cause |
| The gate stops before its end often | the gate is stiff (rails, hinges), or the motor is weak | the electrician (maintenance) |

## 4. Maintenance

**Every year (electrician or the gate's maintainer):**

- Clean and grease the gate's rails or hinges (a stiff gate trips the obstacle cut-off).
- Check the photo-beam (break it while closing: the gate reopens) and the force limit
  (COMMISSIONING.md section 4).
- Check the limit switches stop the gate at both ends.

## 5. Technical data

| | |
|---|---|
| Supply | 24 V DC, 150 W (a DIN-rail power supply, fused 10 A on the board) |
| Motor | 24 V DC gear motor up to about 100 W (2.6 A running, 12 A stalled in the design model) |
| Obstacle cut-off | above about 7 A for 0.1 s (blanked for 0.5 s at each start); short circuit above 25 A within microseconds |
| Travel time limit | 60 s |
| Remote | infrared 38 kHz, NEC protocol, up to four paired |
| Inputs | open limit, close limit, photo-beam (normally closed contacts, 24 V) |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
