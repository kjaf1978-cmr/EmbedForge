// P9 (D24): automatic pump control, purely discrete: a borehole pump (or a transfer pump from a
// ground tank) filling an elevated tank. Start when the water falls below the LOW electrode,
// stop when it reaches HIGH; the OVERFLOW electrode stops the pump and latches a fault (a HIGH
// electrode or a contactor that failed); a DRY electrode in the borehole (or the ground tank)
// stops the pump when the source runs dry and holds it off for 8.5 minutes after the water has
// come back; a pump that runs longer than 2.3 hours latches a fault (a burst pipe, a pump that no
// longer delivers); after a power cut the controller waits 8 s before it may start. The times
// come from a 1 Hz clock and CD4020 counters.
//
// The electrodes (stainless rods, one common per tank) are fed with a 200 Hz square through a
// capacitor, so no DC flows through the water (no electrolysis, no scaling of the rods); each
// sensing electrode is peak-detected and compared with 2 V: about 25 kΩ of water still reads
// wet, a broken cable reads dry, so a broken LOW cable starts the pump (it then stops at HIGH)
// and a broken HIGH cable lets the OVERFLOW electrode stop it (fault, alarm).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface PumpOptions {
  /** Test timing: the clock's timing capacitor (product 1 µF: 1 Hz; the times scale with it:
   *  power-up 8 s, dry lockout 8.5 min, maximum run 2.3 h). */
  clkC?: string;
  /** Test bench: the tank's capacitance (F; 1: a cycle of about 15 s). */
  tankF?: string;
  /** Test bench: the tank's start level (V, 10 V full), the source dry from `dryAt` for
   *  `dryFor` seconds, a broken HIGH electrode cable, the reset button pressed. */
  level0?: number; dryAt?: number; dryFor?: number; highBroken?: boolean; reset?: boolean;
  /** Test bench: no water reaches the tank (a burst pipe). */
  noFlow?: boolean;
  stop?: string;
}

export function pumpControl(o: PumpOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  const V = '+12V';
  nb.para('PUMP CONTROL (borehole or transfer pump, 230 V, up to 1.5 kW): start below LOW, stop at HIGH; OVERFLOW stops and latches FAULT; DRY (source empty) stops and holds off 10 min; more than 2 h of running latches FAULT; 10 s delay after a power cut. AC-excited stainless electrodes (200 Hz, no electrolysis). Reset: button RESET.', -1300, -300);

  // ---- test bench: the mains, the tank (a capacitor: 10 V = full), its fill and consumption, the
  // electrodes as relays that close through 2 kΩ of water when the level passes them
  nb.block('bench').note('TEST BENCH: the mains, the tank and its water (not part of the product)', -1300, -150)
    .part('VM', 'vsin', -1250, 0, { value: '325', freq: '50' }, { '1': 'L', '2': 'N' })
    .part('RNE', 'resistor', -1150, 120, { value: '0.1' }, { '1': 'N', '2': 'GND' }, 1)
    .part('V24', 'battery', -1050, 0, { value: '24', rint: '0.1' }, { '1': 'B24', '2': 'GND' }, 1)
    .part('CTANK', 'capacitor', -950, 100, { value: o.tankF ?? '1', vmax: '50', ic: String(o.level0 ?? 9) }, { '1': 'LVL', '2': 'GND' }, 1)
    .part('RDRAIN', 'resistor', -850, 100, { value: '10', pmax: '1k' }, { '1': 'LVL', '2': 'GND' }, 1)
    .part('VFILL', 'battery', -750, 0, { value: '15', rint: '0.01' }, { '1': 'VF', '2': 'GND' }, 1)
    .part('RFILL', 'resistor', -650, 0, { value: o.noFlow ? '1M' : '5', pmax: '1k' }, { '1': 'VFC', '2': 'LVL' })
    .part('RT3', 'resistor', -1150, 300, { value: '10k' }, { '1': 'B24', '2': 'T3V' }, 1)
    .part('RT3B', 'resistor', -1150, 400, { value: '1.43k' }, { '1': 'T3V', '2': 'GND' }, 1)
    .part('RT8', 'resistor', -1050, 300, { value: '2k' }, { '1': 'B24', '2': 'T8V' }, 1)
    .part('RT8B', 'resistor', -1050, 400, { value: '1k' }, { '1': 'T8V', '2': 'GND' }, 1)
    .part('RT95', 'resistor', -950, 300, { value: '1.53k' }, { '1': 'B24', '2': 'T95V' }, 1)
    .part('RT95B', 'resistor', -950, 400, { value: '1k' }, { '1': 'T95V', '2': 'GND' }, 1);
  // the level comparators of the bench switch its electrode relays (24 V, 15 mA coils)
  const probe = (k: string, th: string, e: string, com: string, x: number) => nb
    .part(`UB${k}`, 'comparator', x, 550, { value: 'LM393', pkg: `BENCH${k === 'O' ? 2 : 1}` }, { '3': th, '2': 'LVL', '1': `KB${k}`, '8': 'B24', '4': 'GND' })
    .part(`KB${k}`, 'relay', x + 100, 550, { value: '24 V' }, { '1': 'B24', '2': `KB${k}`, '3': com, '5': `W${k}` })
    .part(`RW${k}`, 'resistor', x + 200, 550, { value: '2k' }, { '1': `W${k}`, '2': e });
  probe('L', 'T3V', 'EL', 'EC1', -1250);
  probe('H', 'T8V', o.highBroken ? 'EHX' : 'EH', 'EC1', -950);
  probe('O', 'T95V', 'EO', 'EC1', -650);
  if (o.highBroken) nb.part('RHX', 'resistor', -650, 700, { value: '10M' }, { '1': 'EHX', '2': 'GND' }, 1);
  // the source: wet but from dryAt for dryFor seconds (a bench pulse on a relay)
  nb.part('VDRY', 'vpulse', -350, 550, { value: '24', low: '0', freq: String(1 / 1000), duty: String(((o.dryFor ?? 0) / 1000) * 100), delay: String(o.dryAt ?? 999) }, { '1': 'KBDV', '2': 'GND' })
    .part('KBD', 'relay', -250, 550, { value: '24 V' }, { '1': 'KBDV', '2': 'GND', '3': 'EC2', '4': 'WD', '5': 'WDX' })
    .part('RWD', 'resistor', -150, 550, { value: '2k' }, { '1': 'WD', '2': 'ED' })
    .part('RWDX', 'resistor', -150, 650, { value: '10M' }, { '1': 'WDX', '2': 'GND' }, 1);

  // ---- terminals and the 12 V control supply (transformer, bridge, LM317)
  nb.block('supply')
    .part('X1', 'terminal', -1250, 900, { value: 'L' }, { '1': 'L' })
    .part('X2', 'terminal', -1250, 960, { value: 'N' }, { '1': 'N' })
    .part('X3', 'terminal', -1250, 1020, { value: 'PE' }, { '1': 'GND' })
    .part('F1', 'fuse', -1150, 900, { value: '0.2', r: '2' }, { '1': 'L', '2': 'LF' })
    .part('TR1', 'transformer', -1000, 950, { value: '0.075', lp: '20', rp: '200', rs: '1.5', k: '0.995' }, { '1': 'LF', '2': 'N', '3': 'SA', '4': 'SB' })
    .part('BR1', 'bridge', -880, 950, { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VRAW', '4': 'GND' })
    .part('C1', 'capacitor_pol', -780, 1000, { value: '1000u', vmax: '35' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U1', 'lm317', -680, 950, { value: 'LM317HV' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', -600, 1000, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', -680, 1060, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C2', 'capacitor_pol', -520, 1000, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    .part('RREF', 'resistor', -440, 950, { value: '2.2k' }, { '1': V, '2': 'VREF' }, 1)
    .part('UREF', 'tl431', -360, 1000, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3);

  // ---- electrode excitation: a 555 at 200 Hz; each tank's common through 1 µF and 1k
  nb.block('excitation')
    .part('U2', 'timer555', -1250, 1250, { value: 'NE555' }, { '8': V, '4': V, '7': 'XD', '6': 'XT', '2': 'XT', '3': 'EXO', '5': 'XK', '1': 'GND' })
    .part('RXA', 'resistor', -1350, 1170, { value: '10k' }, { '1': V, '2': 'XD' }, 1)
    .part('RXB', 'resistor', -1350, 1280, { value: '33k' }, { '1': 'XD', '2': 'XT' }, 1)
    .part('CXT', 'capacitor', -1350, 1390, { value: '100n', vmax: '50' }, { '1': 'XT', '2': 'GND' }, 1)
    .part('CXK', 'capacitor', -1150, 1390, { value: '10n', vmax: '50' }, { '1': 'XK', '2': 'GND' }, 1)
    .part('CE1', 'capacitor', -1050, 1250, { value: '1u', vmax: '63' }, { '1': 'EXO', '2': 'EX1' })
    .part('RE1', 'resistor', -950, 1250, { value: '1k' }, { '1': 'EX1', '2': 'EC1' })
    .part('CE2', 'capacitor', -1050, 1350, { value: '1u', vmax: '63' }, { '1': 'EXO', '2': 'EX2' })
    .part('RE2', 'resistor', -950, 1350, { value: '1k' }, { '1': 'EX2', '2': 'EC2' });

  // ---- per sensing electrode: 10k, clamps to the rails (long cables), peak detector, comparator
  // against 2 V (VREF 2.5 V divided): output high = wet
  nb.block('electrodes')
    .part('RTH1', 'resistor', -800, 1450, { value: '2.49k' }, { '1': 'VREF', '2': 'VTH' }, 1)
    .part('RTH2', 'resistor', -800, 1560, { value: '10k' }, { '1': 'VTH', '2': 'GND' }, 1);
  ([['L', 'EL'], ['H', 'EH'], ['O', 'EO'], ['D', 'ED']] as [string, string][]).forEach(([k, e], j) => {
    const x = -700 + 220 * j;
    nb.part(`RP${k}`, 'resistor', x, 1250, { value: '10k' }, { '1': e, '2': `P${k}` })
      .part(`DPH${k}`, 'diode', x + 60, 1180, { value: '1N4148' }, { '2': `P${k}`, '1': V }, 3)
      .part(`DPL${k}`, 'diode', x + 60, 1320, { value: '1N4148' }, { '2': 'GND', '1': `P${k}` }, 3)
      .part(`DK${k}`, 'diode', x + 100, 1250, { value: '1N4148' }, { '2': `P${k}`, '1': `H${k}` })
      .part(`CH${k}`, 'capacitor', x + 160, 1350, { value: '1u', vmax: '50' }, { '1': `H${k}`, '2': 'GND' }, 1)
      .part(`RH${k}`, 'resistor', x + 200, 1350, { value: '220k' }, { '1': `H${k}`, '2': 'GND' }, 1)
      .part(`UC${k}`, 'comparator', x + 120, 1500, { value: 'LM339', pkg: 'CMP1' }, { '3': `H${k}`, '2': 'VTH', '1': `W${k}O`, '8': V, '4': 'GND' })
      .part(`RU${k}`, 'resistor', x + 200, 1450, { value: '10k' }, { '1': V, '2': `W${k}O` }, 1);
  });

  // ---- timers: a 555 at 1 Hz and three CD4020 counters, each clock gated by the output that ends
  // its time (the count stops there): READY = Q4 of CT1 (8 s after power-up: CPOR clears it),
  // DRYOK = Q10 of CT2 (8.5 min of wet source: cleared while it is dry), TMAX = Q14 of CT3 (2.3 h of
  // running: cleared while the pump is off). RC timers of minutes or hours are not possible:
  // an electrolytic's leakage is larger than the charging current
  nb.block('timers')
    .part('U3', 'timer555', 300, 1250, { value: 'NE555' }, { '8': V, '4': V, '7': 'SD', '6': 'ST', '2': 'ST', '3': 'CLK', '5': 'SK', '1': 'GND' })
    .part('RSA', 'resistor', 200, 1170, { value: '10k' }, { '1': V, '2': 'SD' }, 1)
    .part('RSB', 'resistor', 200, 1280, { value: '680k' }, { '1': 'SD', '2': 'ST' }, 1)
    .part('CST', 'capacitor', 200, 1390, { value: o.clkC ?? '1u', vmax: '50' }, { '1': 'ST', '2': 'GND' }, 1)
    .part('CSK', 'capacitor', 400, 1390, { value: '10n', vmax: '50' }, { '1': 'SK', '2': 'GND' }, 1)
    .part('UN9', 'nor2', 500, 1250, { value: V, pkg: 'NR3' }, { '1': 'CLK', '2': 'CLK', '3': 'CLKN' })
    .part('CPOR', 'capacitor', 600, 1170, { value: '1u', vmax: '50' }, { '1': V, '2': 'POR' })
    .part('RPOR', 'resistor', 600, 1280, { value: '100k' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('UN10', 'nor2', 700, 1250, { value: V, pkg: 'NR3' }, { '1': 'CLKN', '2': 'RDY', '3': 'CK1' })
    .part('CT1', 'cd4020', 850, 1250, { value: V }, { '10': 'CK1', '11': 'POR', '7': 'RDY' })
    .part('UN11', 'nor2', 700, 1450, { value: V, pkg: 'NR3' }, { '1': 'CLKN', '2': 'DOK', '3': 'CK2' })
    .part('UN12', 'nor2', 550, 1450, { value: V, pkg: 'NR3' }, { '1': 'WDO', '2': 'WDO', '3': 'WDN' })
    .part('CT2', 'cd4020', 850, 1450, { value: V }, { '10': 'CK2', '11': 'WDN', '14': 'DOK' })
    .part('UN13', 'nor2', 700, 1650, { value: V, pkg: 'NR4' }, { '1': 'CLKN', '2': 'TMAX', '3': 'CK3' })
    .part('CT3', 'cd4020', 850, 1650, { value: V }, { '10': 'CK3', '11': 'RUNN', '3': 'TMAX' })
    // PERMIT: a diode AND of READY, DRYOK and not FAULT (10k up)
    .part('RPM', 'resistor', 1000, 1170, { value: '10k' }, { '1': V, '2': 'PERMIT' }, 1)
    .part('DP1', 'diode', 1000, 1250, { value: '1N4148' }, { '2': 'PERMIT', '1': 'RDY' })
    .part('DP2', 'diode', 1000, 1450, { value: '1N4148' }, { '2': 'PERMIT', '1': 'DOK' })
    .part('CD4', 'capacitor', 1100, 1250, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD5', 'capacitor', 1100, 1450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD6', 'capacitor', 1100, 1650, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- logic (CD4001): NWL = not LOW; NPERM; the RUN latch (set by NWL, reset by HIGH or not
  // PERMIT); the FAULT latch (set by OVERFLOW or TMAX, reset by the button); FAULT pulls PERMIT low
  nb.block('logic')
    .part('UN1', 'nor2', 300, 1850, { value: V, pkg: 'NR1' }, { '1': 'WLO', '2': 'WLO', '3': 'NWL' })
    .part('UN2', 'nor2', 450, 1850, { value: V, pkg: 'NR1' }, { '1': 'PERMIT', '2': 'PERMIT', '3': 'NPERM' })
    .part('DR1', 'diode', 600, 1800, { value: '1N4148' }, { '2': 'WHO', '1': 'RRES' })
    .part('DR2', 'diode', 600, 1900, { value: '1N4148' }, { '2': 'NPERM', '1': 'RRES' })
    .part('RRR', 'resistor', 680, 1950, { value: '100k' }, { '1': 'RRES', '2': 'GND' }, 1)
    .part('UN3', 'nor2', 800, 1850, { value: V, pkg: 'NR1' }, { '1': 'RRES', '2': 'RUNN', '3': 'RUNQ' })
    .part('UN4', 'nor2', 950, 1850, { value: V, pkg: 'NR1' }, { '1': 'NWL', '2': 'RUNQ', '3': 'RUNN' })
    .part('DF1', 'diode', 300, 2050, { value: '1N4148' }, { '2': 'WOO', '1': 'FSET' })
    .part('DF2', 'diode', 300, 2150, { value: '1N4148' }, { '2': 'TMAX', '1': 'FSET' })
    .part('RFS', 'resistor', 380, 2200, { value: '100k' }, { '1': 'FSET', '2': 'GND' }, 1)
    .part('SRST', 'button', 450, 2050, { pressed: o.reset ? 'true' : 'false' }, { '1': V, '2': 'FRES' })
    .part('RFR', 'resistor', 520, 2200, { value: '100k' }, { '1': 'FRES', '2': 'GND' }, 1)
    // the power-on pulse also clears the FAULT latch (it starts in a defined state, not
    // oscillating between two, found in simulation)
    .part('DPOR', 'diode', 520, 2100, { value: '1N4148' }, { '2': 'POR', '1': 'FRES' })
    .part('UN5', 'nor2', 650, 2100, { value: V, pkg: 'NR2' }, { '1': 'FSET', '2': 'FLTQ', '3': 'FLTN' })
    .part('UN6', 'nor2', 800, 2100, { value: V, pkg: 'NR2' }, { '1': 'FRES', '2': 'FLTN', '3': 'FLTQ' })
    // 10 nF on one output of each latch: they power up in a defined state (FAULT clear, pump
    // off); two ideal NOR gates powered together otherwise toggle in step
    .part('CFQ', 'capacitor', 870, 2200, { value: '10n', vmax: '50' }, { '1': 'FLTQ', '2': 'GND' }, 1)
    .part('CRQ', 'capacitor', 870, 1950, { value: '10n', vmax: '50' }, { '1': 'RUNQ', '2': 'GND' }, 1)
    .part('DPF', 'diode', 950, 2100, { value: '1N4148' }, { '2': 'PERMIT', '1': 'FLTN' })
    .part('UN7', 'nor2', 650, 2250, { value: V, pkg: 'NR2' }, { '1': 'GND', '2': 'GND', '3': 'NSP1' })
    .part('UN8', 'nor2', 800, 2250, { value: V, pkg: 'NR2' }, { '1': 'GND', '2': 'GND', '3': 'NSP2' })
    .part('UN14', 'nor2', 950, 2250, { value: V, pkg: 'NR4' }, { '1': 'GND', '2': 'GND', '3': 'NSP3' })
    .part('UN15', 'nor2', 1100, 2250, { value: V, pkg: 'NR4' }, { '1': 'GND', '2': 'GND', '3': 'NSP4' })
    .part('UN16', 'nor2', 1250, 2250, { value: V, pkg: 'NR4' }, { '1': 'GND', '2': 'GND', '3': 'NSP5' })
    .part('CD1', 'capacitor', 1000, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD2', 'capacitor', 1100, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD3', 'capacitor', 1200, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- output: RUN and PERMIT (a NOR of their inverses: DR3/DR4 into the driver's base
  // divider) drive the pilot relay; its contact feeds the contactor's coil from the mains
  nb.block('output')
    .part('RB1', 'resistor', 1100, 1650, { value: '22k' }, { '1': 'RUNQ', '2': 'BQ' })
    .part('DB2', 'diode', 1100, 1750, { value: '1N4148' }, { '2': 'BQ', '1': 'PERMIT' })
    .part('RB2', 'resistor', 1180, 1750, { value: '47k' }, { '1': 'BQ', '2': 'GND' }, 1)
    .part('Q1', 'npn', 1250, 1650, { value: 'BC547B' }, { '1': 'BQ', '2': 'KP', '3': 'GND' })
    .part('DQ1', 'diode', 1350, 1580, { value: '1N4148' }, { '2': 'KP', '1': V }, 3)
    .part('K1', 'relay', 1400, 1650, { value: '12 V' }, { '1': V, '2': 'KP', '3': 'LF2', '5': 'KMA' })
    .part('F2', 'fuse', 1500, 1500, { value: '1', r: '0.2' }, { '1': 'L', '2': 'LF2' })
    .part('KM', 'contactor', 1600, 1650, { value: '9 A, coil 230 V AC' }, { A1: 'KMA', A2: 'N', '1': 'LQ', '2': 'LM', '13': 'VF', '14': 'VFC' })
    .part('QF1', 'breaker1', 1500, 1350, { value: '10', curve: 'D' }, { '1': 'L', '2': 'LQ' }, 3)
    .part('X4', 'terminal', 1750, 1600, { value: 'pump L' }, { '1': 'LM' })
    .part('X5', 'terminal', 1750, 1660, { value: 'pump N' }, { '1': 'N' })
    .part('X6', 'terminal', 1750, 1720, { value: 'PE' }, { '1': 'GND' })
    // LEDs: RUN (green, on the relay), FAULT (red), SOURCE DRY (yellow)
    .part('LRUN', 'led', 1300, 1800, { colour: 'green' }, { '2': V, '1': 'LRA' }, 1)
    .part('RLR', 'resistor', 1300, 1900, { value: '2.2k' }, { '1': 'LRA', '2': 'KP' }, 1)
    .part('LFL', 'led', 1400, 1800, { colour: 'red' }, { '2': 'FLTQ', '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1400, 1900, { value: '2.2k' }, { '1': 'LFA', '2': 'GND' }, 1)
    .part('LDR', 'led', 1500, 1800, { colour: 'yellow' }, { '2': V, '1': 'LDA' }, 1)
    .part('RLD', 'resistor', 1500, 1900, { value: '2.2k' }, { '1': 'LDA', '2': 'WDO' }, 1)
    // electrode terminals (to the tank and the source)
    .part('X7', 'terminal', -1250, 1550, { value: 'tank COM' }, { '1': 'EC1' })
    .part('X8', 'terminal', -1250, 1610, { value: 'tank LOW' }, { '1': 'EL' })
    .part('X9', 'terminal', -1250, 1670, { value: 'tank HIGH' }, { '1': 'EH' })
    .part('X10', 'terminal', -1250, 1730, { value: 'tank OVERFLOW' }, { '1': 'EO' })
    .part('X11', 'terminal', -1250, 1790, { value: 'source COM' }, { '1': 'EC2' })
    .part('X12', 'terminal', -1250, 1850, { value: 'source DRY' }, { '1': 'ED' });
  // the pump (test load): a 1.1 kW single-phase motor at its rated slip
  nb.block('load').part('MP', 'motor1', 1850, 1650, { value: '0.05' }, { '1': 'LM', '2': 'N' });
  nb.v('LVL').v('RUNQ').v('PERMIT').v('FLTQ');
  nb.sim({ type: 'tran', stop: o.stop ?? '30', step: '1m', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
