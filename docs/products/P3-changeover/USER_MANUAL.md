# Mains / back-up change-over (P3): user manual

Single-phase (1P, `changeover-1p`) and three-phase (3P+N, `changeover-3p`) automatic change-over
switch, 32 A, for a house or workshop with a back-up source (generator or inverter).

> **Safety.** This unit switches mains voltage. It must be installed, connected and serviced by
> a qualified electrician following the local wiring rules (IEC 60364 or the national
> equivalent). Many countries require a change-over between the grid and a generator to be a
> certified product, approved by the grid operator. This design has not been certified and no
> prototype has been built yet (see TYPE_TESTS.md). Do not connect it to the grid before it has
> passed those tests and been accepted locally.

## 1. What it does

The load runs from the mains while the mains is healthy, and from the back-up source when it
is not. It is never connected to both at the same time.

| | Single-phase | Three-phase 3P+N |
|---|---|---|
| Mains accepted while connected | 195 … 253 V (−15 % / +10 %) | every phase 195 … 253 V and none more than about 10 … 13 % below the highest (7 % holds, 12 % trips in the simulation) |
| Trip to back-up | below 195 V or above 253 V | one phase below 195 V or above 253 V, a lost phase, an asymmetry of about 10 … 13 % or more |
| Return to the mains | about 11 s after the mains is healthy again (10.5 s return delay + 0.47 s dead time); after a trip only once it is back within about 205 … 245 V | about 11 s after every phase is healthy |
| Gap between the sources | 0.47 s, both contactors open | same |
| Switched conductors | L and N | L1, L2, L3 and N |
| Rated current | 32 A per pole, AC-1 (resistive and mixed loads); motors: see INSTALLATION.md, section 5 | same |

Behaviour in more detail:

- **Return delay.** A flickering mains does not make the load hunt between the sources, and
  fridges and compressors get time to equalise before they restart.
- **Hysteresis after a trip.** A mains hovering near a limit does not make the contactors
  chatter.
- **Control supply.** It is taken from whichever source is present.
- **Coil-supply lockout.** If the 24 V control supply falls below 20 V (a brown-out of both
  sources), both contactors open rather than chatter.
- **Interlock.** Each contactor's coil is fed through the other one's normally closed auxiliary
  contact. This is a mirror contact: it cannot be closed while the main contacts are closed, even
  when they are welded. A mechanical interlock between the two contactors also stops both
  closing at once, so neither a welded contactor nor a logic fault can connect both sources.
- **Start-up.** When the unit is powered with both sources present, it first connects the
  back-up for about 11 s, then the mains (the return delay runs from power-up). With only the
  mains present, the load waits about 11 s and then runs from the mains.

## 2. Indicators (front panel)

| LED | Colour | Meaning |
|---|---|---|
| ON MAINS | green | the mains contactor is closed: the load runs from the mains |
| ON BACK-UP | yellow | the back-up contactor is closed: the load runs from the back-up source |
| OVERVOLTAGE | red | the mains (a phase in 3P+N) is above 253 V |
| UNDERVOLTAGE | red | the mains (a phase) is below 195 V, missing, or (3P+N) out of balance |

| What you see | What it means | What to do |
|---|---|---|
| Green on | normal operation on the mains | nothing |
| Yellow on, a red LED on | the mains is faulty; the load runs on back-up | wait; it returns by itself about 11 s after the mains is healthy again |
| Yellow on, no red LED | the mains has just come back; the return delay is running | wait about 11 s |
| Nothing on, back-up running | the back-up breaker is off, or the control supply has failed | check the back-up breaker Q2, the board-feed fuses on the DIN rail and the 0.2 A fuses on the board (electrician) |
| Green and yellow never together | (by design) | if both ever light, switch off both breakers and call the electrician |
| Red LED on, green on | cannot happen in normal use (a trip opens the mains contactor at once) | switch off and call the electrician |

## 3. Operation

There is nothing to operate in normal use. To work on the load circuit, switch off both
breakers: **Q1 (mains)** and **Q2 (back-up)**.

The back-up source must be able to supply the load you connect, including starting currents.
Size the generator or inverter accordingly.

## 4. Maintenance

**Every year (electrician):**

- Check the terminal screws to the torque on the label (loose terminals are the most common cause
  of fire in such boxes).
- Look for discolouration.
- Check that the vent membrane and insect mesh are clean.
- Press the breakers' test buttons where fitted.
- Do a transfer test: switch Q1 off, and the load goes to back-up within about 0.5 s. Switch Q1
  on, and the load returns after about 11 s.

**Surge protection:** the varistors (RV1, RV2; 3P+N: RV1 … RV6) are thermally protected and disconnect themselves at the
end of their life. After a known lightning event, or every 5 years, the electrician checks them
(see COMMISSIONING.md, step 5). The installation's own type 2 SPD in the distribution board is
inspected according to its manufacturer's instructions.

**Contactors:** the contactors switch only at the transfers (a few times a year in most places).
Replace a contactor whose contacts show heavy pitting, or whose closing has become noisy.

## 5. Technical data

| | |
|---|---|
| Rated voltage | 230 V (1P) / 400/230 V (3P+N), 50 Hz |
| Rated current | 32 A per pole (AC-1) |
| Protection | C32 breaker on each source (6 kA); 10 A gG fuses for the board's feeds; thermally protected 300 V varistors L–N on every phase of both sources (L–PE: the installation's type 2 SPD) |
| Control supply | from either source, 24 V DC, lockout below 20 V |
| Transfer time | 0.47 s dead time (+ contactor times) |
| Return delay | 10.5 s (+ 0.47 s dead time) |
| Enclosure | IP54 with vent membrane and insect mesh, wall mounting (DIN rail for breakers and contactors) |
| Ambient | designed and simulated at 25 °C; the operating range is set by the temperature-rise and damp-heat type tests (TYPE_TESTS.md); the board is conformally coated |

Known limits:

- The unit does not start the generator. A generator with automatic start on mains failure is
  needed, or the generator is started by hand.
- It does not synchronise. The load sees the 0.47 s gap at every transfer, so computers need
  their own UPS.
