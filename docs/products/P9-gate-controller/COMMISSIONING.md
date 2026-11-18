# Gate controller (P9): commissioning procedure

Done by the gate installer or an electrician before the gate is put into service, and after any
repair. Record every result at the end. The designators are those of the schematic.

You need a multimeter, a stopwatch, a force gauge for powered gates (or the installer's force
measuring device), and a test piece (a 50 mm block) for the obstacle test.

## 1. Before power

1. The gate moves freely by hand over its whole travel.
2. The wiring against INSTALLATION.md; the limit switches open at their ends (continuity X9–X3
   opens at the open end, X9–X6 at the closed end); the photo-beam's contact X7–X8 is closed while
   the beam is received and opens when it is broken.

## 2. Power-up

| Step | Action | Expected |
|---|---|---|
| 2.1 | Supply on | nothing moves |
| 2.2 | 5 V at the Nano's 5V pin | 4.8 … 5.2 V |
| 2.3 | **Pair the remote(s):** hold LEARN (SW2) and press the remote's button; release | — |
| 2.4 | Press the remote with the gate part-way | the gate opens |

## 3. Travel

| Step | Action | Expected |
|---|---|---|
| 3.1 | Let it open to the end | the open limit stops it; it stays still |
| 3.2 | Press | it closes; the close limit stops it |
| 3.3 | Press while it moves | it stops; press again: it moves the other way |
| 3.4 | Time a full travel | below 60 s (else the travel time limit stops it early: check the gate's speed) |

## 4. Safety

| Step | Action | Expected |
|---|---|---|
| 4.1 | **Photo-beam.** While closing, break the beam | the gate stops at once and reopens fully |
| 4.2 | With the gate open and the beam broken, press | the gate does not close |
| 4.3 | **Obstacle, closing.** Place the 50 mm block at the closing edge; close | the gate stops at the block within about 0.1 s of stalling and reopens |
| 4.4 | **Force.** With the force gauge at the closing edge (at mid height and at the end of travel) | the force within the limits of the rules (EN 12453: dynamic force at most 400 N, its duration within 0.75 s, static force at most 150 N after 5 s); else lower the cut-off or fit a safety edge |
| 4.5 | **Obstacle, opening.** Hold the gate while it opens | it stops and moves back briefly |
| 4.6 | **Three obstacles.** Obstruct it three times without letting it reach an end | it stays stopped; the next press opens it |
| 4.7 | **Power cut.** Supply off while the gate moves; on again | nothing moves until the remote is pressed |

## Record

| Item | Expected | Measured | OK |
|---|---|---|---|
| Limit switches open at their ends (X9–X3, X9–X6) | yes | | |
| Beam contact X7–X8 opens when broken | yes | | |
| 5 V | 4.8 … 5.2 V | | |
| Remotes paired (number) | 1 … 4 | | |
| Open and close stop at the limits | yes | | |
| Full travel time | below 60 s: ___ s | | |
| Beam while closing: stop and reopen | yes | | |
| No close with the beam broken | yes | | |
| Obstacle closing: stop and reopen | yes | | |
| Closing force (dynamic, static) | ≤ 400 N, ≤ 150 N: ___ N, ___ N | | |
| Obstacle opening: stop and release | yes | | |
| Lockout after three obstacles | yes | | |
| Power cut: no movement | yes | | |

Date, gate and serial number, name and signature:
