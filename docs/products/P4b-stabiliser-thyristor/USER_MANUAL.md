# Mains voltage stabilisers 5, 10 and 15 kVA, thyristor taps (P4b): user manual

Step-type automatic voltage regulators (AVR) for a house, a workshop or a small business on a
grid whose voltage wanders. Three sizes:

| Size | Rated output | Output current at 230 V | Input current at 140 V |
|---|---|---|---|
| 5 kVA | 5 kVA | 22 A | 36 A |
| 10 kVA | 10 kVA | 43 A | 71 A |
| 15 kVA | 15 kVA | 65 A | 107 A |

> **Safety.** These units work at mains voltage, and their control boards are live. They must be
> installed and serviced by a qualified electrician, following the local wiring rules. They have
> not been certified, and no prototype has been built yet (see TYPE_TESTS.md). They are not
> isolating transformers: the output is not separated from the mains.

## 1. What it does

The input is connected to one of seven taps of an autotransformer (150, 170, 190, 210, 230, 250
and 280 V). The output is taken from its 230 V tap. Each tap is switched by a pair of thyristors
(electronic switches without contacts), chosen from the measured input voltage:

| Input voltage | Tap used | Output (calculated, V_in · 230 / tap) |
|---|---|---|
| below about 160 V | 150 V | 215 … 245 V (140 … 160 V in) |
| 160 … 180 V | 170 V | 216 … 244 V |
| 180 … 200 V | 190 V | 218 … 242 V |
| 200 … 220 V | 210 V | 219 … 241 V |
| 220 … 240 V | 230 V | 220 … 240 V |
| 240 … 265 V | 250 V | 221 … 244 V |
| above about 265 V | 280 V | 218 … 246 V (265 … 300 V in) |

The voltages in the table are the rising switching points. On the way down, each step changes a
few volts lower (hysteresis), so the taps do not change back and forth.

Behaviour:

- **Output range.** Over 140 … 300 V of input, the output stays within 230 V ± 10 %. At full load
  and the lowest input, the voltage drop in the unit takes up to about 2 %.
- **Tap changes without interruption.** A tap changes when the current passes zero: the old pair
  stops, the unit checks that every pair has stopped, and then the new pair starts, all within
  a fraction of a millisecond. Lamps do not blink, and computers are not disturbed.
- **Start-up.** At switch-on the unit first measures the input (about 0.5 s), then switches the
  tap on, and connects the load through the output contactor after a restart delay of about
  8.5 s. The same delay runs after every cut-off. Fridge compressors need longer: give them their
  own 3-minute restart-delay relay (INSTALLATION.md).
- **Independent protection.** A second circuit, with its own sense transformer, reference and its
  own relay in the contactor's coil feed, watches the output. If the output leaves 190 … 255 V,
  the contactor opens. This happens if the input is outside about 124 … 310 V, or if the control
  has failed. The restart delay then starts again.
- **Faults that lock the unit off.** Some faults keep the output off until the unit is switched
  off and on again:
  - two taps commanded at once (an electronic fault);
  - a tap change that cannot finish (a thyristor pair failed short).
- **Overheating.** The thyristors' heatsink has a fan, which runs when the heatsink is warm. Above
  70 °C at the heatsink, or with its temperature sensor disconnected, the output is cut off. A
  thermal cut-out in the transformer winding switches the thyristors off: the transformer is
  switched off, not only its load.
- **Surges.** A thermally protected varistor limits surges between L and N.

## 2. Indicators

| LED | Colour | Meaning |
|---|---|---|
| TAP 1 … TAP 7 | yellow | the tap in use (one at a time; none while a tap changes) |
| OUTPUT | green | the restart delay has run and the output relay is closed |
| FAULT | red | the protection does not find the output within 190 … 255 V, or the heatsink is too hot, or a locking fault |

| What you see | Meaning | What to do |
|---|---|---|
| One yellow, green on | normal | nothing |
| Red for about 1 s, then green after about 8.5 s, at switch-on | start-up and restart delay | wait |
| Green off, red on, one yellow on | the output out of range, the heatsink too hot, or its sensor disconnected | let it cool; check the fan; if it repeats, call the electrician |
| Green off, red on, no yellow | a locking fault (two taps commanded, a tap change that cannot finish), or the transformer too hot | switch off, wait a minute, switch on. If it repeats, call the electrician |
| Nothing on | no input, the breaker has tripped, or the control's fuse has blown | check the breaker; then the electrician |

## 3. Use

Connect only up to the rated power. A motor's starting current counts: for a fridge, the rule of
thumb is three times its running power.

The stabiliser draws more current from a low grid than it delivers: up to 36 / 71 / 107 A at
140 V input. Its supply circuit and breaker are sized for that (INSTALLATION.md).

## 4. Maintenance

**Every year (electrician):**

- Check the terminal and power-cable screws to the torques in INSTALLATION.md.
- Clean the heatsink fins and the fan; check that the fan turns when the heatsink is warm.
- Look for heat discolouration at the transformer, the thyristor modules and the boards.
- Repeat the protection checks (COMMISSIONING.md, section 5).

**Varistor:** check it after a known lightning event, or every 5 years (COMMISSIONING.md).

There are no contacts that wear in the tap switching. The output contactor switches only at
start-up and on a fault.

## 5. Technical data

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| Rated output | 5 kVA, 22 A | 10 kVA, 43 A | 15 kVA, 65 A |
| Input range | 140 … 300 V, 50 Hz | same | same |
| Input current at 140 V | 36 A | 71 A | 107 A |
| Input breaker (2-pole, C) | 40 A | 80 A | 125 A |
| Thyristor fuse (aR) | 50 A | 100 A | 160 A |
| Thyristor modules | SKKT 106/16E | SKKT 106/16E | SKKT 162/16E |
| Output contactor | 32 A AC-3 | 65 A AC-3 | 95 A AC-3 |
| Heat in the thyristors at 140 V, full load | about 30 W | about 65 W | about 150 W |

All sizes:

| | |
|---|---|
| Tap change | 6 steps at the current zero, no interruption |
| Protection window | output 190 … 255 V, else the contactor opens |
| Start-up, restart delay | load supplied about 8.5 s after switch-on and after each cut-off |
| Control supply | AC-DC module 85 … 305 V AC to 12 V, 15 W |
| Transformer | autotransformer, 7 taps, class F, thermal cut-out 115 °C, self-resetting |
| Heatsink | fan on above about 50 °C; output cut off above 70 °C or with the sensor open |
| Insulation | protection class I; the control boards are not isolated from the mains |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
