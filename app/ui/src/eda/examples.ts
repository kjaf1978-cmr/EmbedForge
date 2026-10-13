// Example projects (UI-24): small circuits to start from, each with a prepared analysis and
// probes, and a "try this" hint. Built from part positions and pin coordinates, so the tests
// can check that every example is connected and simulates without errors.

import { addLabel, addWire, placePart } from './editor';
import { annotate, emptySheet, newId, type Probe, type Rot, type Sheet, type SimSettings } from './schematic';
import type { Pt } from './symbols';

export interface Example {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate';
  summary: string;
  tryThis: string;
  build: () => Sheet;
}

const COLOURS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

class B {
  s = emptySheet();
  private probes = 0;
  part(sym: string, x: number, y: number, props: Record<string, string> = {}, rot: Rot = 0): string {
    const r = placePart(this.s, sym, { x, y }, rot, false, props);
    this.s = r.sheet;
    return r.id;
  }
  wire(...pts: [number, number][]) { this.s = addWire(this.s, pts.map(([x, y]) => ({ x, y }))); }
  label(name: string, x: number, y: number) { this.s = addLabel(this.s, name, { x, y }).sheet; }
  v(x: number, y: number) { this.s.probes.push({ id: newId('pr'), kind: 'v', at: { x, y } as Pt, colour: COLOURS[this.probes++ % COLOURS.length] }); }
  i(part: string, pin: string) { this.s.probes.push({ id: newId('pr'), kind: 'i', part, pin, colour: COLOURS[this.probes++ % COLOURS.length] } as Probe); }
  sim(s: SimSettings) { this.s.sim = s; }
  done(): Sheet { return annotate(this.s); }
}

export const EXAMPLES: Example[] = [
  {
    id: 'led', title: 'LED with series resistor', level: 'beginner',
    summary: 'A 5 V supply lights a red LED through a 330 Ω resistor. The operating point shows every voltage and the LED current.',
    tryThis: 'Select R1 and change its value to 1k: the LED current drops to about 3 mA and the LED dims.',
    build: () => {
      const b = new B();
      b.part('vdc', 0, 0, { value: '5' });
      b.part('resistor', 60, -60, { value: '330' });
      const d = b.part('led', 120, -30, { colour: 'red' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 120, 60);
      b.wire([0, -30], [0, -60], [30, -60]); b.wire([90, -60], [120, -60]); b.wire([120, 0], [120, 60]); b.wire([0, 30], [0, 60]);
      b.i(d, '2');
      b.sim({ type: 'op' });
      return b.done();
    },
  },
  {
    id: 'divider', title: 'Voltage divider', level: 'beginner',
    summary: 'Two resistors divide 12 V. OUT = 12 V × 4.7k / (10k + 4.7k) ≈ 3.84 V.',
    tryThis: 'Choose "DC sweep" of V1 from 0 to 12 V: OUT rises in a straight line with the slope 0.32.',
    build: () => {
      const b = new B();
      b.part('vdc', 0, 0, { value: '12' });
      b.part('resistor', 80, -30, { value: '10k' }, 1);
      b.part('resistor', 80, 30, { value: '4.7k' }, 1);
      b.part('gnd', 0, 90); b.part('gnd', 80, 90);
      b.wire([0, -30], [0, -60], [80, -60]); b.wire([0, 30], [0, 90]); b.wire([80, 60], [80, 90]); b.wire([80, 0], [130, 0]);
      b.label('OUT', 130, 0);
      b.v(110, 0);
      b.sim({ type: 'op' });
      return b.done();
    },
  },
  {
    id: 'rc-lowpass', title: 'RC low-pass filter (frequency response)', level: 'beginner',
    summary: 'R1 and C1 form a first-order low-pass filter with its corner at 1/(2π·R·C) ≈ 1.59 kHz. The AC analysis plots gain and phase.',
    tryThis: 'Move the cursor to −3 dB to read the corner frequency, then change C1 to 10n: the corner moves up by ten.',
    build: () => {
      const b = new B();
      b.part('vsin', 0, 0, { value: '1', freq: '1k', ac: '1' });
      b.part('resistor', 60, -60, { value: '1k' });
      b.part('capacitor', 120, -30, { value: '100n' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 120, 60);
      b.wire([0, -30], [0, -60], [30, -60]); b.wire([90, -60], [170, -60]); b.wire([0, 30], [0, 60]); b.wire([120, 0], [120, 60]);
      b.label('IN', 0, -60); b.label('OUT', 170, -60);
      b.v(15, -60); b.v(150, -60);
      b.sim({ type: 'ac', fstart: '10', fstop: '1meg', perDecade: '20' });
      return b.done();
    },
  },
  {
    id: 'rc-charge', title: 'Capacitor charging (time response)', level: 'beginner',
    summary: 'A 5 V square wave charges and discharges C1 through R1. The time constant τ = R·C = 10 ms.',
    tryThis: 'Put the cursors at the start of a rising edge and where OUT reaches 63 %: ΔT is one time constant.',
    build: () => {
      const b = new B();
      b.part('vpulse', 0, 0, { value: '5', low: '0', freq: '20', duty: '50' });
      b.part('resistor', 60, -60, { value: '10k' });
      b.part('capacitor', 120, -30, { value: '1u' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 120, 60);
      b.wire([0, -30], [0, -60], [30, -60]); b.wire([90, -60], [170, -60]); b.wire([0, 30], [0, 60]); b.wire([120, 0], [120, 60]);
      b.label('IN', 0, -60); b.label('OUT', 170, -60);
      b.v(15, -60); b.v(150, -60);
      b.sim({ type: 'tran', stop: '100m', step: '50u' });
      return b.done();
    },
  },
  {
    id: 'transistor-switch', title: 'Transistor switch with a push-button', level: 'beginner',
    summary: 'Pressing SW1 drives base current into Q1, which switches the LED on. R2 holds the base low when the button is released.',
    tryThis: 'Hold SW1 down with the mouse (or select it and hold Space): the LED lights and the collector voltage drops to about 0.1 V.',
    build: () => {
      const b = new B();
      b.part('power', 0, -100, { value: '+5V' });
      b.part('button', 0, -60, {}, 1);
      b.part('resistor', 60, 0, { value: '10k' });
      b.part('resistor', 0, 30, { value: '100k' }, 1);
      b.part('npn', 150, 0, { value: '2N3904' });
      const d = b.part('led', 160, -90, { colour: 'green' }, 1);
      b.part('resistor', 160, -150, { value: '330' }, 1);
      b.part('power', 160, -200, { value: '+5V' });
      b.part('gnd', 0, 90); b.part('gnd', 160, 60);
      b.wire([0, -100], [0, -90]); b.wire([0, -30], [0, 0], [30, 0]); b.wire([90, 0], [120, 0]); b.wire([0, 60], [0, 90]);
      b.wire([160, -60], [160, -30]); b.wire([160, 30], [160, 60]); b.wire([160, -200], [160, -180]);
      b.label('BASE', 110, 0);
      b.i(d, '2');
      b.sim({ type: 'op' });
      return b.done();
    },
  },
  {
    id: 'pot-dimmer', title: 'LED dimmer with a potentiometer', level: 'beginner',
    summary: 'RV1 sets the base voltage of Q1, and the transistor sets the LED current.',
    tryThis: 'Drag the wiper of RV1 (or select it and use the slider in the properties): the LED brightness follows.',
    build: () => {
      const b = new B();
      b.part('power', 0, -90, { value: '+5V' });
      b.part('potentiometer', 0, -30, { value: '10k', position: '50' }, 1);
      b.part('resistor', 90, -30, { value: '10k' });
      b.part('npn', 150, -30, { value: 'BC547B' });
      const d = b.part('led', 160, -90, { colour: 'yellow' }, 1);
      b.part('resistor', 160, -150, { value: '220' }, 1);
      b.part('power', 160, -190, { value: '+5V' });
      b.part('gnd', 0, 30); b.part('gnd', 160, 30);
      b.wire([0, -90], [0, -60]); b.wire([0, 0], [0, 30]); b.wire([30, -30], [60, -30]); b.wire([160, 0], [160, 30]); b.wire([160, -190], [160, -180]);
      b.i(d, '2');
      b.sim({ type: 'op' });
      return b.done();
    },
  },
  {
    id: 'opamp-amp', title: 'Non-inverting op-amp amplifier', level: 'intermediate',
    summary: 'U1 amplifies the input by 1 + R1/R2 = 1 + 10k/2.2k ≈ 5.5. The ±12 V rails come from power symbols.',
    tryThis: 'Raise the input amplitude V1 to 2.5 V: the output clips about 1.5 V below each rail.',
    build: () => {
      const b = new B();
      b.part('opamp', 100, 0, { value: 'generic' });
      b.part('power', 90, -60, { value: '+12V' });
      b.part('power', 90, 60, { value: '-12V' }, 2);
      b.part('vsin', 0, 20, { value: '0.5', freq: '1k', ac: '1' });
      b.part('resistor', 100, 100, { value: '10k' });
      b.part('resistor', 40, 150, { value: '2.2k' }, 1);
      b.part('resistor', 180, 30, { value: '10k' }, 1);
      b.part('gnd', 0, 80); b.part('gnd', 40, 210); b.part('gnd', 180, 90);
      b.wire([90, -60], [90, -40]); b.wire([90, 40], [90, 60]);
      b.wire([0, -10], [50, -10]); b.wire([0, 50], [0, 80]);
      b.wire([140, 0], [180, 0]); b.wire([140, 0], [140, 100], [130, 100]); b.wire([70, 100], [40, 100], [40, 10], [50, 10]); b.wire([40, 100], [40, 120]);
      b.wire([40, 180], [40, 210]); b.wire([180, 60], [180, 90]);
      b.label('IN', 20, -10); b.label('OUT', 180, 0);
      b.v(30, -10); b.v(160, 0);
      b.sim({ type: 'tran', stop: '3m', step: '5u' });
      return b.done();
    },
  },
  {
    id: 'rectifier', title: 'Half-wave rectifier with smoothing', level: 'intermediate',
    summary: 'D1 passes the positive half-waves of a 10 V, 50 Hz sine; C1 smooths them. The ripple depends on the load RL.',
    tryThis: 'Change RL to 220 Ω: the ripple grows. Change C1 to 470u: it shrinks.',
    build: () => {
      const b = new B();
      b.part('vsin', 0, 0, { value: '10', freq: '50', ac: '0' });
      b.part('diode', 60, -60, { value: '1N4007' });
      b.part('capacitor_pol', 120, -30, { value: '100u' }, 1);
      b.part('resistor', 180, -30, { value: '1k' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 120, 30); b.part('gnd', 180, 30);
      b.wire([0, -30], [0, -60], [30, -60]); b.wire([90, -60], [180, -60]); b.wire([0, 30], [0, 60]); b.wire([120, 0], [120, 30]); b.wire([180, 0], [180, 30]);
      b.label('OUT', 150, -60);
      b.v(0, -45); b.v(160, -60);
      b.sim({ type: 'tran', stop: '100m', step: '50u' });
      return b.done();
    },
  },
  {
    id: 'zener', title: 'Zener voltage regulator', level: 'intermediate',
    summary: 'D1 holds OUT near 5.1 V while the input rises above it; R1 takes up the difference.',
    tryThis: 'Look at the DC sweep: below about 6 V the output follows the input divided by R1 and RL; above it, it stays flat.',
    build: () => {
      const b = new B();
      b.part('vdc', 0, 0, { value: '12' });
      b.part('resistor', 60, -60, { value: '470' });
      b.part('zener', 120, -30, { value: 'BZX55C5V1' }, 3);
      b.part('resistor', 180, -30, { value: '1k' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 120, 30); b.part('gnd', 180, 30);
      b.wire([0, -30], [0, -60], [30, -60]); b.wire([90, -60], [180, -60]); b.wire([0, 30], [0, 60]); b.wire([120, 0], [120, 30]); b.wire([180, 0], [180, 30]);
      b.label('OUT', 150, -60);
      b.v(160, -60);
      b.sim({ type: 'dc', target: 'V1', param: 'value', start: '0', stop: '15', step: '0.25' });
      return b.done();
    },
  },
];

EXAMPLES.push(
  {
    id: 'blinker555', title: '555 LED blinker', level: 'intermediate',
    summary: 'A 555 timer in astable mode charges C1 through R1 and R2 and discharges it through R2: the LED blinks at f = 1.44 / ((R1 + 2·R2)·C1) ≈ 1 Hz.',
    tryThis: 'Look at THR: the capacitor swings between 3 V and 6 V (1/3 and 2/3 of 9 V). Change R2 to 33k and simulate again: the blinking gets about twice as fast.',
    build: () => {
      const b = new B();
      b.part('timer555', 100, 0);
      b.part('power', 90, -80, { value: '+9V' });
      b.part('power', 20, -120, { value: '+9V' });
      b.part('resistor', 20, -80, { value: '10k' }, 1);
      b.part('resistor', 20, 10, { value: '68k' }, 1);
      b.part('capacitor_pol', 50, 70, { value: '10u' }, 1);
      b.part('capacitor', 160, 50, { value: '10n' }, 1);
      b.part('resistor', 200, 0, { value: '330' });
      const d = b.part('led', 230, 30, { colour: 'red' }, 1);
      b.part('gnd', 50, 130); b.part('gnd', 160, 110); b.part('gnd', 100, 80); b.part('gnd', 230, 90);
      b.wire([90, -80], [90, -50]); b.wire([110, -50], [110, -60], [90, -60]);
      b.wire([20, -120], [20, -110]); b.wire([20, -50], [20, -20], [60, -20]);
      b.wire([60, 0], [50, 0], [50, 40]); b.wire([60, 20], [50, 20]); b.wire([20, 40], [50, 40]);
      b.wire([50, 100], [50, 130]); b.wire([140, 20], [160, 20]); b.wire([160, 80], [160, 110]); b.wire([100, 50], [100, 80]);
      b.wire([140, 0], [170, 0]); b.wire([230, 60], [230, 90]);
      b.label('THR', 50, 10); b.label('OUT', 150, 0);
      b.v(50, 30); b.v(160, 0); b.i(d, '2');
      b.sim({ type: 'tran', stop: '3', step: '1m', start: 'zero' });
      return b.done();
    },
  },
  {
    id: 'regulator', title: '5 V supply with a 7805 regulator', level: 'beginner',
    summary: 'A 9 V battery feeds a 7805 linear regulator with its input and output capacitors and a 100 Ω load (50 mA).',
    tryThis: 'The DC sweep raises the battery voltage from 0 to 12 V: OUT follows the input up to about 7 V (the 2 V dropout), then stays at 5 V. Select U1 and choose AMS1117-5.0: the dropout shrinks to about 1.1 V.',
    build: () => {
      const b = new B();
      b.part('battery', 0, 0, { value: '9', rint: '0.5' });
      b.part('regulator', 100, -60, { value: '7805' });
      b.part('capacitor', 40, -30, { value: '330n' }, 1);
      b.part('capacitor', 160, -30, { value: '100n' }, 1);
      b.part('resistor', 200, -30, { value: '100' }, 1);
      b.part('gnd', 0, 60); b.part('gnd', 40, 30); b.part('gnd', 100, 0); b.part('gnd', 160, 30); b.part('gnd', 200, 30);
      b.wire([0, -30], [0, -60], [60, -60]); b.wire([140, -60], [200, -60]);
      b.wire([0, 30], [0, 60]); b.wire([40, 0], [40, 30]); b.wire([100, -30], [100, 0]); b.wire([160, 0], [160, 30]); b.wire([200, 0], [200, 30]);
      b.label('IN', 20, -60); b.label('OUT', 180, -60);
      b.v(10, -60); b.v(190, -60);
      b.sim({ type: 'dc', target: 'BT1', param: 'value', start: '0', stop: '12', step: '0.1' });
      return b.done();
    },
  },
);

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
