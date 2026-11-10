// Every part of every design names a model the library has: findModel falls back to the list's
// first model, so a misspelt value would simulate as another part without a word.
import { describe, expect, it } from 'vitest';
import { MODEL_MISSES } from '../src/eda/models';
import { buildSimNet } from '../src/eda/simnet';
import { changeover1, changeover3, stabiliser, mpptCharger } from '../src/eda/powerExamples';
import { inverterLF, inverterHF } from '../src/eda/inverters';
import { stabiliserT } from '../src/eda/stabiliserT';
import { mainsHouse, pvHouse } from '../src/eda/surge';
import { pumpControl } from '../src/eda/pumpControl';
import { irrigationFront } from '../src/eda/irrigation';
import { gateController } from '../src/eda/gate';
import type { Sheet } from '../src/eda/schematic';

const DESIGNS: [string, () => { sheet: Sheet }][] = [
  ['change-over 1P', () => changeover1()], ['change-over 3P', () => changeover3()], ['stabiliser 1 kVA', () => stabiliser()],
  ['MPPT charger', () => mpptCharger()],
  ...([16, 8, 4] as const).flatMap((c): [string, () => { sheet: Sheet }][] => [[`inverter LF ${c} cells`, () => inverterLF({ cells: c })], [`inverter HF ${c} cells`, () => inverterHF({ cells: c } as never)]]),
  ...([5, 10, 15] as const).map((k): [string, () => { sheet: Sheet }] => [`stabiliser ${k} kVA`, () => stabiliserT({ kva: k })]),
  ['surge: mains house', () => mainsHouse('lightning')], ['surge: PV house', () => pvHouse()],
  ['pump control', () => pumpControl()], ['irrigation', () => irrigationFront({ shortAt: 0.01, surgeKv: 1, sensorSurgeKv: 1, q2Random: true })],
  ['gate controller', () => gateController({ shortAt: 0.5, obstacleAt: 0.5 })],
];

describe('every design\'s parts name a model of the library', () => {
  for (const [name, make] of DESIGNS) it(name, () => {
    MODEL_MISSES.clear();
    buildSimNet(make().sheet);
    expect([...MODEL_MISSES]).toEqual([]);
  }, 60_000);
});
