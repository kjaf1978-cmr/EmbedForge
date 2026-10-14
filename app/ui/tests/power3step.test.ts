// The three-phase change-over: voltage changes while connected to the mains (the trip thresholds).
import { describe } from 'vitest';
import { run3 } from './power3.helpers';

const at = 0.3;
describe('three-phase (3P+N) change-over: trips while connected', () => {
  run3([
    [[230, 230, 230], { to: [190, 230, 230], at }, 'backup', 'undervoltage of L1'],
    [[230, 230, 230], { to: [256, 230, 230], at }, 'backup', 'overvoltage of L1'],
    [[230, 230, 230], { to: [250, 250, 250], at }, 'mains', 'inside the window'],
    [[230, 230, 230], { to: [230, 230, 202], at }, 'backup', 'L3 12 % below'],
    [[230, 230, 230], { to: [230, 230, 214], at }, 'mains', 'L3 7 % below'],
  ]);
});
