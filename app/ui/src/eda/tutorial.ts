// Guided first-circuit tutorial (UI-24): each step says what to do and checks the sheet itself,
// so it advances as soon as the user has done it, whichever way they did it.

import type { Sheet } from './schematic';
import { connectivity } from './connectivity';
import type { SimOutcome } from '../sim/client';

export interface TutorialStep {
  title: string;
  text: string;
  hint: string;
  /** `start` is the sheet when the step began. */
  done: (s: Sheet, r: SimOutcome | null, start: Sheet) => boolean;
}

const has = (s: Sheet, sym: string) => s.parts.some((p) => p.sym === sym);

export const FIRST_CIRCUIT: TutorialStep[] = [
  {
    title: '1 · Add a voltage source',
    text: 'Every circuit needs power. In the parts list on the left, find "DC voltage source" (type "dc" in the search box) and click it, then click on the sheet to place it.',
    hint: 'Shortcut: press A to jump to the part search.',
    done: (s) => has(s, 'vdc') || has(s, 'battery'),
  },
  {
    title: '2 · Add a resistor and an LED',
    text: 'Place a "Resistor" and an "LED" to the right of the source. Press R before clicking to rotate a part.',
    hint: 'An LED needs a resistor in series to limit its current.',
    done: (s) => has(s, 'resistor') && has(s, 'led'),
  },
  {
    title: '3 · Add ground',
    text: 'Add a "Ground" symbol below the circuit (press G, then click). All voltages are measured against ground.',
    hint: 'One ground symbol is enough; you can add more, they are all connected.',
    done: (s) => has(s, 'gnd'),
  },
  {
    title: '4 · Wire it up',
    text: 'Press W (or click a pin end) and click from pin to pin: source + → resistor → LED anode (left side, the triangle); LED cathode (the bar) → ground; source − → ground.',
    hint: 'Small circles mark pins that are not connected yet. Click on a pin to end a wire there; Esc stops wiring.',
    done: (s) => {
      const c = connectivity(s);
      const first = (syms: string[]) => s.parts.find((p) => syms.includes(p.sym));
      const parts = [first(['vdc', 'battery']), first(['resistor']), first(['led'])];
      if (parts.some((p) => !p)) return false;
      const allPins = parts.every((p) => c.pinNet.has(`${p!.ref}.1`) && c.pinNet.has(`${p!.ref}.2`));
      return allPins && c.nets.some((n) => n.name === 'GND' && n.pins.length >= 2);
    },
  },
  {
    title: '5 · Simulate',
    text: 'Press F5 or click "Simulate". The voltages appear on the wires, and the LED lights up if current flows.',
    hint: 'If it does not light, check the LED direction: current flows from the triangle to the bar.',
    done: (_s, r) => !!r && !('error' in r) && r.analysis === 'op',
  },
  {
    title: '6 · Change a value',
    text: 'Click the resistor and change its value in Properties, for example to 1k. The simulation updates at once: the LED dims.',
    hint: 'Values take engineering notation: 330, 1k, 4k7, 2.2M.',
    done: (s, _r, start) => s.parts.some((p) => p.sym === 'resistor' && start.parts.some((q) => q.id === p.id && q.props.value !== p.props.value)),
  },
];
