// The worked products pass ERC: no floating nets, every switched coil and motor clamped, every
// value purchasable. What remains are the board-only parts without a simulation model (SIM-05).
import { describe, expect, it } from 'vitest';
import { erc } from '../src/eda/erc';
import type { Sheet } from '../src/eda/schematic';
import { stabiliser, changeover1, changeover3, mpptCharger } from '../src/eda/powerExamples';
import { stabiliserT } from '../src/eda/stabiliserT';
import { mainsHouse, pvHouse } from '../src/eda/surge';
import { pumpControl } from '../src/eda/pumpControl';
import { irrigationMain, irrigationModule } from '../src/eda/irrigationBoards';
import { irrigationFront } from '../src/eda/irrigation';
import { gateController } from '../src/eda/gate';
import { trimmer } from '../src/eda/trimmer';
import { blockMachine } from '../src/eda/blockMachine';
import { grinder } from '../src/eda/grinder';

const PRODUCTS: [string, () => { sheet: Sheet }][] = [
  ['changeover-1p', changeover1], ['changeover-3p', changeover3], ['stabiliser-1kva', stabiliser], ['mppt-charger', mpptCharger],
  ...[5, 10, 15].map((kva) => [`stabiliser-t-${kva}kva`, () => stabiliserT({ kva })] as [string, () => { sheet: Sheet }]),
  ['surge-mains-house', () => mainsHouse('lightning')], ['surge-pv-house', () => pvHouse()], ['pump-control', pumpControl],
  ['irrigation-main', irrigationMain], ['irrigation-module', irrigationModule], ['irrigation-field-interface', irrigationFront],
  ['gate-controller', gateController], ['trimmer-drive', trimmer], ['block-machine', blockMachine],
  ['grinder-240V', () => grinder({ supply: '240' })], ['grinder-24V', () => grinder({ supply: '24' })],
];

describe('ERC of the worked products', () => {
  for (const [name, build] of PRODUCTS) it(`${name}: no ERC finding except board-only parts`, () => {
    const found = erc(build().sheet).filter((i) => i.severity !== 'info' && i.rule !== 'SIM-05');
    expect(found.map((i) => i.message)).toEqual([]);
  }, 120_000);
});
