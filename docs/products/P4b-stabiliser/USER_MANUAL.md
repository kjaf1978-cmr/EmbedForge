# Mains voltage stabilisers 5, 10 and 15 kVA, contactor-switched taps (P4b): user manual

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
and 280 V). The output is taken from its 230 V tap. Each tap is switched by a contactor, chosen
from the measured input voltage:

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
- **Tap changes with a short gap.** Before a tap changes, the input contactor opens; the tap
  contactors change while no current flows, and the input contactor closes again once the unit
  has checked that exactly the right tap contactor is closed. The load sees a gap of about a
  quarter of a second. Lamps blink once; most appliances ride through it, but a computer without
  a UPS may restart. The tap contactors never switch current, so they do not wear.
- **Start-up.** At switch-on the unit first measures the input (about 0.8 s), then closes the
  tap and the input contactor, and connects the load through the output contactor after a restart delay of about
  8.5 s. The same delay runs after every cut-off. Fridge compressors need longer: give them their
  own 3-minute restart-delay relay (INSTALLATION.md).
- **Independent protection.** A second circuit, with its own sense transformer, reference and its
  own relay in the contactor's coil feed, watches the output. If the output leaves 190 … 255 V,
  the contactor opens. This happens if the input is outside about 124 … 310 V, or if the control
  has failed. The restart delay then starts again.
- **Faults.**
  - none: every fault the unit detects opens the output, and the output returns by itself once the
    fault has gone. A tap contactor that does not open or close as commanded (welded, or its
    drive failed) keeps the input contactor open: the output stays off (FAULT) until it is
    repaired.
- **Overheating.** A thermal cut-out in the transformer winding opens the input contactor: the
  transformer is switched off, not only its load. It resets itself when the winding has cooled.
- **Overload.** An output breaker protects the output cables; the input breaker protects the
  input.
- **Surges.** A thermally protected varistor limits surges between L and N.

## 2. Indicators

| LED | Colour | Meaning |
|---|---|---|
| TAP 1 … TAP 7 | yellow | the tap contactor commanded (one at a time) |
| OUTPUT | green | the restart delay has run and the output relay is closed |
| FAULT | red | the protection does not find the 230 V tap within 190 … 255 V |

| What you see | Meaning | What to do |
|---|---|---|
| One yellow, green on | normal | nothing |
| Red for about 1 s, then green after about 8.5 s, at switch-on | start-up and restart delay | wait |
| Lamps blink once now and then | a tap change (about 0.25 s) | nothing; many changes a day mean a very unsteady grid |
| Green off, red on, one yellow on, for a long time | the input out of range (below about 124 V or above about 310 V), the transformer too hot (its cut-out open), or a tap contactor that did not follow its command | if the input is normal, call the electrician |
| Nothing on | no input, the breaker has tripped, or the control's fuse has blown | check the breakers; then the electrician |

## 3. Use

Connect only up to the rated power. A motor's starting current counts: for a fridge, the rule of
thumb is three times its running power.

The stabiliser draws more current from a low grid than it delivers: up to 36 / 71 / 107 A at
140 V input. Its supply circuit and breaker are sized for that (INSTALLATION.md).

## 4. Maintenance

**Every year (electrician):**

- Check the terminal and power-cable screws to the torques in INSTALLATION.md.
- Look for heat discolouration at the transformer, the contactors, the links between the tap
  contactors' poles and the board.
- Repeat the protection checks (COMMISSIONING.md, section 5).

**Input contactor KI:** it makes and breaks the input current at every tap change. Count about
1.5 million operations; at 200 changes a day that is about 20 years. Replace it when its contacts
show wear (it is the one part that wears), or after a known short circuit.

**Varistor:** check it after a known lightning event, or every 5 years (COMMISSIONING.md).

## 5. Technical data

| | 5 kVA | 10 kVA | 15 kVA |
|---|---|---|---|
| Rated output | 5 kVA, 22 A | 10 kVA, 43 A | 15 kVA, 65 A |
| Input range | 140 … 300 V, 50 Hz | same | same |
| Input current at 140 V | 36 A | 71 A | 107 A |
| Input breaker QF1 (2-pole, C) | 40 A | 80 A | 125 A |
| Output breaker QF2 (C) | 25 A | 50 A | 80 A |
| Tap contactors (7, three poles in parallel) | 25 A frame | 40 A frame | 50 A frame |
| Input and output contactors | 40 A frame | 80 A frame | 115 A frame |

All sizes:

| | |
|---|---|
| Tap change | 6 steps; the input contactor open for about 0.25 s per change |
| Protection window | output 190 … 255 V, else the output contactor opens |
| Start-up, restart delay | load supplied about 8.5 s after switch-on and after each cut-off |
| Control supplies | 12 V, 15 W (control); 24 V, 96 W (contactor coils); both 90 … 305 V AC |
| Transformer | autotransformer, 7 taps, class F, thermal cut-out 115 °C, self-resetting |
| Insulation | protection class I; the control board is not isolated from the mains |
| Ambient | designed and simulated at 25 °C; the range is set by the type tests |
