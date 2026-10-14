// The three-phase change-over from start-up: a start is a reconnection (the narrower window).
import { describe, expect, it } from 'vitest';
import { changeover3 } from '../src/eda/powerExamples';
import { erc } from '../src/eda/erc';
import { run3 } from './power3.helpers';

describe('three-phase (3P+N) change-over from start-up', () => {
  it('ERC clean', () => {
    const { sheet } = changeover3();
    expect(erc(sheet).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
  });
  run3([
    [[230, 230, 230], undefined, 'mains', 'balanced'], [[240, 240, 240], undefined, 'mains', 'balanced, high'],
    [[190, 190, 190], undefined, 'backup', 'undervoltage'], [[230, 230, 0], undefined, 'backup', 'loss of L3'],
    [[230, 230, 202], undefined, 'backup', 'L3 12 % below'],
  ]);
});
