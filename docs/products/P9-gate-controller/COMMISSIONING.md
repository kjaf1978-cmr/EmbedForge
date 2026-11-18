# Gate controller (P9): commissioning procedure

Done by the gate installer or an electrician before the gate is put into service, and after any
repair. Record every result at the end. The designators are those of the schematic.

You need a multimeter, a stopwatch, a force gauge for powered gates (or the installer's force
measuring device), and a test piece (a 50 mm block) for the obstacle test.

## 1. Before power

1. The gate moves freely by hand over its whole travel.
2. **The gate uncoupled from the motor** (the motor's release lever, or the drive's pinion off the
   rack) for section 3.
3. The wiring against INSTALLATION.md; the limit switches open at their ends (continuity X9–X3
   opens at the open end, X9–X6 at the closed end); STOP (or its link) closed between X10 and X11;
   the photo-beam's contact X7–X8 closed while the beam is received.
4. The shunt R28 is the 10 mΩ part (its marking, or 10 mΩ measured four-wire): a wrong value sets
   the cut-off wrong.

## 2. Power-up

| Step | Action | Expected |
|---|---|---|
| 2.1 | Supply on | nothing moves; the CUT-OFF LED (D15) lit; the Nano's LED flashes briefly every second |
| 2.2 | 5 V at the Nano's 5V pin | 4.8 … 5.2 V |
| 2.3 | 24 V at X14 (the photo-beam transmitter) | 22 … 25 V |
| 2.4 | **Pair the remote(s):** hold LEARN (SW1) and press the remote's button; release | the Nano's LED flashes three times |

## 3. Direction (the gate uncoupled)

| Step | Action | Expected |
|---|---|---|
| 3.1 | Press the remote | the CUT-OFF LED goes out; the motor turns in the gate's **opening** direction (else supply off, swap X4 and X5, repeat) |
| 3.2 | While it turns, open the open limit switch by hand (or disconnect X3) | the motor stops |
| 3.3 | Press, then press STOP while the motor turns | it stops; the Nano's LED lit steadily while STOP is held; nothing starts while it is held |
| 3.4 | Supply off; **couple the gate to the motor**; supply on | — |

## 4. Travel

| Step | Action | Expected |
|---|---|---|
| 4.1 | Press with the gate part-way | the gate opens; the open limit stops it; it stays still |
| 4.2 | Press | the photo-beam's transmitter goes off and on (its LED, if it has one), then the gate closes; the close limit stops it |
| 4.3 | Press while it moves | it stops; press again: it moves the other way |
| 4.4 | The push-button / key-switch (X12) | works like the remote |
| 4.5 | Time a full travel | below 60 s (else the travel time limit stops it early: check the gate's speed) |

## 5. Safety

| Step | Action | Expected |
|---|---|---|
| 5.1 | **Photo-beam.** While closing, break the beam | the gate stops at once and reopens fully |
| 5.2 | With the gate open and the beam broken, press | the gate does not close |
| 5.3 | **Beam test.** With the gate open, bridge X7–X8 (a test lead), press; remove the lead | the gate does not close; the Nano's LED flashes twice every second. Without the lead the next press closes it |
| 5.4 | **Obstacle, closing.** Place the 50 mm block at the closing edge; close | the gate stops at the block within about 0.1 s of stalling and reopens |
| 5.5 | **Force.** With the force gauge at the closing edge (at mid height and at the end of travel; and blocked from the start of a close) | within EN 12453: dynamic force at most 400 N and above 150 N for at most 0.75 s; static force at most 150 N up to 5 s, at most 25 N after; else lower the cut-off or fit a safety edge |
| 5.6 | **Obstacle, opening.** Hold the gate while it opens | it stops and moves back for about 0.5 s |
| 5.7 | **Three obstacles.** Obstruct it three times without letting it reach an end | at the third it moves back briefly and stays stopped; the Nano's LED flashes twice every second; the next press opens it |
| 5.8 | **STOP.** Press STOP while the gate moves | it stops at once |
| 5.9 | **Power cut.** Supply off while the gate moves; on again | nothing moves until a press |

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| Limit switches open at their ends (X9–X3, X9–X6) | yes | | |
| Beam contact X7–X8 opens when broken | yes | | |
| Shunt R28 10 mΩ | yes | | |
| 5 V; 24 V at X14 | 4.8 … 5.2 V; 22 … 25 V | | |
| Remotes paired (number) | 1 … 4 | | |
| Motor turns the opening way; the open limit and STOP stop it (uncoupled) | yes | | |
| Open and close stop at the limits | yes | | |
| Key-switch works | yes / not fitted | | |
| Full travel time | below 60 s: ___ s | | |
| Beam while closing: stop and reopen | yes | | |
| No close with the beam broken; none with X7–X8 bridged | yes | | |
| Obstacle closing: stop and reopen | yes | | |
| Closing force (dynamic, static) | ≤ 400 N, ≤ 150 N: ___ N, ___ N | | |
| Obstacle opening: stop and release | yes | | |
| Third obstacle: release, then lockout | yes | | |
| STOP while moving | stops | | |
| Power cut: no movement | yes | | |

Date, gate and serial number, name and signature:
