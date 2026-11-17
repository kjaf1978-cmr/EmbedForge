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
//
// After the P9 audit (D47) and its independent review (17 November 2026):
// - The control and the electrodes are SELV: a safety isolating transformer (IEC 61558-2-6), DIN-rail
//   interface relays with reinforced coil–contact insulation, the transformer's primary 5.5 mm from
//   the control, and the control's 0 V NOT bonded to PE. Bonded (PELV), an earthed metal tank, a
//   steel casing or a galvanised rising main short every rod to the 0 V: the tank read dry and the
//   pump ran into an overflow (review blocker 1).
// - An independent protection: its own sensing chains on the OVERFLOW and DRY rods, a continuity
//   check of each tank's COM rod (two cores: the excitation out, its return back), its own LM393s
//   and relay K2, which works its own contactor KM2 in series with the pump contactor KM: a stuck
//   K1, a failed logic or a welded KM cannot run the pump into an overflow or dry.
// - 100 Hz excitation and a 22k load on every sensing input: an open rod on a long cable is not
//   read wet through the cable's capacitance (at 200 Hz without the load, about 6 nF did).
// - Hysteresis on every comparator; the maximum-run counter cleared whenever the pump is off and at
//   power-up; PERMIT in series with RUN (a second transistor); a TEST button on the SELV side.

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
  /** Tests (DFMEA): the pilot relay's driver shorted (K1 on from power-up); the tank's COM rod's
   *  return core broken; the pump contactor KM welded (its poles held closed). */
  k1Shorted?: boolean; comBroken?: boolean; kmWelded?: boolean;
  /** Test bench: each electrode cable's capacitance between its rod core and its COM core (F). */
  cableC?: string;
  stop?: string;
  /** Tests: the simulation's time step (default 1 ms). */
  step?: string;
}

export function pumpControl(o: PumpOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB().wireUp(['+12V']);
  const V = '+12V';
  nb.para('PUMP CONTROL (borehole or transfer pump, 230 V, up to 1.5 kW): start below LOW, stop at HIGH; OVERFLOW stops and latches FAULT; DRY (source empty) stops and holds off 8.5 min after the water returns; more than 2.3 h of running latches FAULT; 8 s delay after a power cut. AC-excited stainless electrodes (100 Hz, no electrolysis). The control and the electrodes are SELV (safety isolating transformer, interface relays with reinforced insulation, 0 V not earthed); an independent protection (OVERFLOW, DRY, the continuity of the COM rods) opens its own relay K2 and contactor KM2. Reset: button RESET (door).', -1300, -300);

  // ---- test bench: the mains, the tank (a capacitor: 10 V = full), its fill and consumption, the
  // electrodes as relays that close through 2 kΩ of water when the level passes them
  nb.block('bench').note('TEST BENCH: the mains, the tank and its water (not part of the product)', -1300, -150)
    .part('VM', 'vsin', -1250, 0, { value: '325', freq: '50' }, { '1': 'L', '2': 'N' })
    .part('RNE', 'resistor', -1150, 120, { value: '0.1' }, { '1': 'N', '2': 'PE' }, 1)
    // the control is SELV (not earthed): its 0 V reaches PE only through the insulation
    .part('RISO', 'resistor', -1100, 220, { value: '100M' }, { '1': 'PE', '2': 'GND' }, 1)
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
  nb.part('RCR1', 'resistor', -1250, 750, { value: o.comBroken ? '100M' : '1' }, { '1': 'EC1', '2': 'ER1' })
    .part('RCR2', 'resistor', -1150, 750, { value: '1' }, { '1': 'EC2', '2': 'ER2' });
  if (o.cableC) for (const [e, c, x] of [['EL', 'EC1', -1050], ['EH', 'EC1', -950], ['EO', 'EC1', -850], ['ED', 'EC2', -750]] as [string, string, number][])
    nb.part(`CC${e}`, 'capacitor', x, 750, { value: o.cableC, vmax: '50' }, { '1': c, '2': e }, 1);
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
    .part('X1', 'terminal', -1250, 900, { value: 'L', wire: '2.5' }, { '1': 'L' })
    .part('X2', 'terminal', -1250, 960, { value: 'N', wire: '2.5' }, { '1': 'N' })
    .part('X3', 'terminal', -1250, 1020, { value: 'PE', wire: '2.5' }, { '1': 'PE' })
    // the board's mains entry, behind the gG 2 A fuse F2 (its feed wires protected, 100 kA
    // breaking), fused again for its tracks (ceramic, 1.5 kA); the transformer a safety isolating
    // type (IEC 61558-2-6, short-circuit proof, 4.5 VA): the control and the electrodes are SELV
    .part('F1', 'fuse', -1150, 900, { value: '0.2', r: '2', fusetype: 'H' }, { '1': 'LF2', '2': 'LF' })
    .part('TR1', 'transformer', -1000, 950, { value: '0.075', lp: '20', rp: '200', rs: '1.5', k: '0.995' }, { '1': 'LF', '2': 'N', '3': 'SA', '4': 'SB' })
    .part('BR1', 'bridge', -880, 950, { value: 'DB107' }, { '1': 'SA', '2': 'SB', '3': 'VRAW', '4': 'GND' })
    .part('C1', 'capacitor_pol', -780, 1000, { value: '1000u', vmax: '35' }, { '1': 'VRAW', '2': 'GND' }, 1)
    .part('U1', 'lm317', -680, 950, { value: 'LM317HV' }, { '3': 'VRAW', '1': 'ADJ', '2': V })
    .part('RA1', 'resistor', -600, 1000, { value: '240' }, { '1': V, '2': 'ADJ' }, 1)
    .part('RA2', 'resistor', -680, 1060, { value: '2.05k' }, { '1': 'ADJ', '2': 'GND' }, 1)
    .part('C2', 'capacitor_pol', -520, 1000, { value: '100u', vmax: '25' }, { '1': V, '2': 'GND' }, 1)
    .part('RREF', 'resistor', -440, 950, { value: '2.2k' }, { '1': V, '2': 'VREF' }, 1)
    .part('UREF', 'tl431', -360, 1000, { value: 'TL431' }, { '1': 'VREF', '2': 'GND', '3': 'VREF' }, 3);

  // ---- electrode excitation: a 555 at about 100 Hz; each tank's common through 1 µF and 1k
  nb.block('excitation')
    .part('U2', 'timer555', -1250, 1250, { value: 'NE555' }, { '8': V, '4': V, '7': 'XD', '6': 'XT', '2': 'XT', '3': 'EXO', '5': 'XK', '1': 'GND' })
    .part('RXA', 'resistor', -1350, 1170, { value: '10k' }, { '1': V, '2': 'XD' }, 1)
    .part('RXB', 'resistor', -1350, 1280, { value: '68k' }, { '1': 'XD', '2': 'XT' }, 1)
    .part('CXT', 'capacitor', -1350, 1390, { value: '100n', vmax: '50' }, { '1': 'XT', '2': 'GND' }, 1)
    .part('CXK', 'capacitor', -1150, 1390, { value: '10n', vmax: '50' }, { '1': 'XK', '2': 'GND' }, 1)
    .part('CE1', 'capacitor', -1050, 1250, { value: '1u', vmax: '63' }, { '1': 'EXO', '2': 'EX1' })
    .part('RE1', 'resistor', -950, 1250, { value: '1k' }, { '1': 'EX1', '2': 'EC1' })
    .part('CE2', 'capacitor', -1050, 1350, { value: '1u', vmax: '63' }, { '1': 'EXO', '2': 'EX2' })
    .part('RE2', 'resistor', -950, 1350, { value: '1k' }, { '1': 'EX2', '2': 'EC2' })
    // the COM lines' surge clamps (the electrode cables are long and outdoors)
    .part('DTC1', 'tvs', -850, 1250, { value: 'SMAJ12CA' }, { '1': 'EC1', '2': 'GND' }, 1)
    .part('DTC2', 'tvs', -850, 1350, { value: 'SMAJ12CA' }, { '1': 'EC2', '2': 'GND' }, 1);

  // ---- per sensing electrode: 10k in, 22k and 100 nF to 0 V (a rod in air on a long cable reads
  // below the threshold through the cable's capacitance), clamps to the rails, peak detector, comparator
  // against 1.2 V (VREF 2.5 V divided) with 10 M of hysteresis: output high = wet
  nb.block('electrodes')
    .part('RTH1', 'resistor', -800, 1450, { value: '10k' }, { '1': 'VREF', '2': 'VTH' }, 1)
    .part('RTH2', 'resistor', -800, 1560, { value: '9.09k' }, { '1': 'VTH', '2': 'GND' }, 1);
  ([['L', 'EL'], ['H', 'EH'], ['O', 'EO'], ['D', 'ED']] as [string, string][]).forEach(([k, e], j) => {
    const x = -700 + 220 * j;
    nb.part(`RP${k}`, 'resistor', x, 1250, { value: '10k' }, { '1': e, '2': `P${k}` })
      .part(`DPH${k}`, 'diode', x + 60, 1180, { value: '1N4148' }, { '2': `P${k}`, '1': V }, 3)
      .part(`DPL${k}`, 'diode', x + 60, 1320, { value: '1N4148' }, { '2': 'GND', '1': `P${k}` }, 3)
      .part(`RG${k}`, 'resistor', x + 20, 1360, { value: '22k' }, { '1': `P${k}`, '2': 'GND' }, 1)
      // 100 nF with the 10k: a low-pass that passes the 100 Hz of a wet rod and takes the square
      // wave's edges out of a rod in air (through a long cable's capacitance they were peak-detected
      // as a wet reading: found in simulation)
      .part(`CPF${k}`, 'capacitor', x - 70, 1300, { value: '100n', vmax: '50' }, { '1': `P${k}`, '2': 'GND' }, 1)
      .part(`DK${k}`, 'diode', x + 100, 1250, { value: '1N4148' }, { '2': `P${k}`, '1': `H${k}` })
      .part(`CH${k}`, 'capacitor', x + 160, 1350, { value: '1u', vmax: '50' }, { '1': `H${k}`, '2': 'GND' }, 1)
      .part(`RH${k}`, 'resistor', x + 200, 1350, { value: '220k' }, { '1': `H${k}`, '2': 'GND' }, 1)
      .part(`UC${k}`, 'comparator', x + 120, 1500, { value: 'LM339', pkg: 'CMP1' }, { '3': `H${k}`, '2': 'VTH', '1': `W${k}O`, '8': V, '4': 'GND' })
      .part(`RU${k}`, 'resistor', x + 200, 1450, { value: '10k' }, { '1': V, '2': `W${k}O` }, 1)
      .part(`RY${k}`, 'resistor', x + 60, 1440, { value: '10M' }, { '1': `W${k}O`, '2': `H${k}` });
  });

  // ---- the independent protection's own sensing chains (as the control's): OVERFLOW and DRY,
  // and the return core of each COM rod (the excitation comes back only while both cores and the
  // rod's connections are whole)
  nb.block('protection sensing');
  ([['O', 'EO'], ['D', 'ED'], ['R1', 'ER1'], ['R2', 'ER2']] as [string, string][]).forEach(([k, e], j) => {
    const x = 300 + 260 * j;
    nb.part(`RQ${k}`, 'resistor', x, 2600, { value: '10k' }, { '1': e, '2': `Q${k}` })
      .part(`RQG${k}`, 'resistor', x + 20, 2710, { value: '22k' }, { '1': `Q${k}`, '2': 'GND' }, 1)
      .part(`CQF${k}`, 'capacitor', x - 30, 2710, { value: '100n', vmax: '50' }, { '1': `Q${k}`, '2': 'GND' }, 1)
      .part(`DQH${k}`, 'diode', x + 60, 2530, { value: '1N4148' }, { '2': `Q${k}`, '1': V }, 3)
      .part(`DQL${k}`, 'diode', x + 60, 2670, { value: '1N4148' }, { '2': 'GND', '1': `Q${k}` }, 3)
      .part(`DJ${k}`, 'diode', x + 100, 2600, { value: '1N4148' }, { '2': `Q${k}`, '1': `J${k}` })
      .part(`CJ${k}`, 'capacitor', x + 160, 2700, { value: '1u', vmax: '50' }, { '1': `J${k}`, '2': 'GND' }, 1)
      .part(`RJ${k}`, 'resistor', x + 210, 2700, { value: '220k' }, { '1': `J${k}`, '2': 'GND' }, 1);
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
    // the maximum run counted only while the pump runs: cleared whenever RUN is off (UN16) and at
    // power-up (its own power-up state was random; reset by RUNN it also counted while the pump
    // waited, and a latched TMAX could not be reset: the review of 17 November)
    .part('CT3', 'cd4020', 850, 1650, { value: V }, { '10': 'CK3', '11': 'RST3', '3': 'TMAX' })
    .part('DT31', 'diode', 950, 1750, { value: '1N4148' }, { '2': 'NRUN', '1': 'RST3' })
    .part('DT32', 'diode', 950, 1820, { value: '1N4148' }, { '2': 'POR', '1': 'RST3' })
    .part('RT3R', 'resistor', 1020, 1780, { value: '100k' }, { '1': 'RST3', '2': 'GND' }, 1)
    // PERMIT: a diode AND of READY, DRYOK and not FAULT (10k up)
    .part('RPM', 'resistor', 1000, 1170, { value: '10k' }, { '1': V, '2': 'PERMIT' }, 1)
    .part('DP1', 'diode', 1000, 1250, { value: '1N4148' }, { '2': 'PERMIT', '1': 'RDY' })
    .part('DP2', 'diode', 1000, 1450, { value: '1N4148' }, { '2': 'PERMIT', '1': 'DOKE' })
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
    .part('SRST', 'button', 450, 2050, { pressed: o.reset ? 'true' : 'false', panel: 'true' }, { '1': V, '2': 'FRES' })
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
    // the dry lockout applies only after a dry spell: DSQ (set while the source is dry, cleared
    // at power-up) and DOKE = DOK or no dry spell since power-up. Without it the pump waited the
    // whole lockout (8.5 min) after every power cut, found in simulation
    .part('UN7', 'nor2', 650, 2250, { value: V, pkg: 'NR2' }, { '1': 'WDN', '2': 'DSQ', '3': 'DSN' })
    .part('UN8', 'nor2', 800, 2250, { value: V, pkg: 'NR2' }, { '1': 'POR', '2': 'DSN', '3': 'DSQ' })
    .part('CDS', 'capacitor', 870, 2350, { value: '10n', vmax: '50' }, { '1': 'DSQ', '2': 'GND' }, 1)
    .part('UN14', 'nor2', 950, 2250, { value: V, pkg: 'NR4' }, { '1': 'DOK', '2': 'DSN', '3': 'DOKN' })
    .part('UN15', 'nor2', 1100, 2250, { value: V, pkg: 'NR4' }, { '1': 'DOKN', '2': 'DOKN', '3': 'DOKE' })
    .part('UN16', 'nor2', 1250, 2250, { value: V, pkg: 'NR4' }, { '1': 'RUNQ', '2': 'RUNQ', '3': 'NRUN' })
    .part('CD1', 'capacitor', 1000, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD2', 'capacitor', 1100, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('CD3', 'capacitor', 1200, 2350, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1);

  // ---- output: RUN and PERMIT, two transistors in series (both must be on), drive the pilot relay
  // K1; its contact feeds the pump contactor's coil. (A diode from PERMIT into the base divider
  // left the base at 1.3 V with PERMIT low: the review of 17 November)
  nb.block('output')
    .part('RB1', 'resistor', 1150, 1700, { value: '22k' }, { '1': 'RUNQ', '2': 'BQ' })
    .part('RB2', 'resistor', 1180, 1750, { value: '47k' }, { '1': 'BQ', '2': 'QE' }, 1)
    .part('Q1', 'npn', 1250, 1650, { value: 'BC547B' }, { '1': 'BQ', '2': 'KP', '3': 'QE' })
    .part('RB5', 'resistor', 1150, 1560, { value: '47k' }, { '1': 'PERMIT', '2': 'BQP' })
    .part('RB6', 'resistor', 1180, 1500, { value: '47k' }, { '1': 'BQP', '2': 'GND' }, 1)
    .part('Q4', 'npn', 1250, 1500, { value: 'BC547B' }, { '1': 'BQP', '2': 'QE', '3': 'GND' })
    // TEST: forces K1 on from the SELV side, for the commissioning of the independent protection
    // (a button: it cannot be left bridged)
    .part('STST', 'button', 1330, 1500, { pressed: 'false' }, { '1': 'KP', '2': 'GND' })
    .part('DQ1', 'diode', 1350, 1580, { value: '1N4148' }, { '2': 'KP', '1': V }, 3)
    // the pilot relay and the protection's relay K2: DIN-rail interface relays (reinforced
    // insulation coil–contact), their contacts in series in the contactor's coil feed (gG 2 A)
    .part('K1', 'relay', 1400, 1650, { value: '12 V interface', din: 'true' }, { '1': V, '2': 'KP', '3': 'LF2', '4': 'LF2', '5': 'KMA' })
    .part('F2', 'fuse', 1500, 1500, { value: '2', r: '0.05', din: '1' }, { '1': 'L', '2': 'LF2' })
    // the pump contactor KM (worked by K1) after the protection's contactor KM2 (worked by K2): a
    // welded KM is still stopped by KM2 (18 A AC-3: a 1.5 kW single-phase pump draws 10 … 11 A)
    .part('KM2', 'contactor', 1600, 1450, { value: '18 A, coil 230 V AC' }, { A1: 'KM2A', A2: 'N', '1': 'LQ', '2': 'LQ2', '3': 'NQ', '4': 'NQ2', '13': 'VFM', '14': 'VFC' })
    .part('KM', 'contactor', 1600, 1650, { value: '18 A, coil 230 V AC' }, { A1: 'KMA', A2: 'N', '1': 'LQ2', '2': 'LM', '3': 'NQ2', '4': 'NM', '13': 'VF', '14': 'VFM' })
    // the pump's motor-protective circuit breaker (9 … 14 A, set to its rated current); L and N
    // through its poles as the maker's single-phase wiring (every pole carrying current)
    .part('QF1', 'breaker2', 1500, 1350, { value: '14', curve: 'M' }, { '1': 'L', '2': 'LQ', N1: 'N', N2: 'NQ' }, 3)
    .part('X4', 'terminal', 1750, 1600, { value: 'pump L', wire: '2.5' }, { '1': 'LM' })
    .part('X5', 'terminal', 1750, 1660, { value: 'pump N', wire: '2.5' }, { '1': 'NM' })
    // PE in and out through the PE stud; the control is SELV, its 0 V is not bonded to PE
    .part('X6', 'terminal', 1750, 1720, { value: 'PE', wire: '2.5' }, { '1': 'PE' })
    // the independent protection: its own sensing chains (as the control's) on the OVERFLOW and DRY
    // rods and on each COM rod's return core, its own threshold (VT2) and comparators (two LM393),
    // its own driver and relay K2, which works KM2: OVERFLOW wet, the source dry or a COM rod
    // disconnected opens KM2 at once, whatever the logic, its counters, K1 or KM do
    .part('RT21', 'resistor', 1050, 2000, { value: '10k' }, { '1': 'VREF', '2': 'VT2' }, 1)
    .part('RT22', 'resistor', 1050, 2100, { value: '9.09k' }, { '1': 'VT2', '2': 'GND' }, 1)
    .part('UIO', 'comparator', 1150, 2050, { value: 'LM393', pkg: 'PROT' }, { '3': 'VT2', '2': 'JO', '1': 'OK2', '8': V, '4': 'GND' })
    .part('UID', 'comparator', 1150, 2200, { value: 'LM393', pkg: 'PROT' }, { '3': 'JD', '2': 'VT2', '1': 'OK2', '8': V, '4': 'GND' })
    .part('UIR1', 'comparator', 1150, 2350, { value: 'LM393', pkg: 'PROT2' }, { '3': 'JR1', '2': 'VT2', '1': 'OK2', '8': V, '4': 'GND' })
    .part('UIR2', 'comparator', 1150, 2500, { value: 'LM393', pkg: 'PROT2' }, { '3': 'JR2', '2': 'VT2', '1': 'OK2', '8': V, '4': 'GND' })
    // hysteresis: OK2 low lowers VT2 (overflow side) through 10 M
    .part('RY2', 'resistor', 1050, 2200, { value: '10M' }, { '1': 'OK2', '2': 'VT2' })
    .part('CD8', 'capacitor', 1250, 2450, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    .part('RK2', 'resistor', 1250, 1980, { value: '10k' }, { '1': V, '2': 'OK2' }, 1)
    .part('RB3', 'resistor', 1300, 2100, { value: '22k' }, { '1': 'OK2', '2': 'BQ2' })
    .part('RB4', 'resistor', 1350, 2200, { value: '47k' }, { '1': 'BQ2', '2': 'GND' }, 1)
    .part('Q2', 'npn', 1420, 2100, { value: 'BC547B' }, { '1': 'BQ2', '2': 'KP2', '3': 'GND' })
    .part('DQ2', 'diode', 1500, 2030, { value: '1N4148' }, { '2': 'KP2', '1': V }, 3)
    .part('K2', 'relay', 1580, 2100, { value: '12 V interface', din: 'true' }, { '1': V, '2': 'KP2', '3': 'LF2', '4': 'LF2', '5': 'KM2A' })
    .part('CD7', 'capacitor', 1250, 2300, { value: '100n', vmax: '50' }, { '1': V, '2': 'GND' }, 1)
    // LEDs: RUN (green, on the relay), FAULT (red), SOURCE DRY (yellow)
    .part('LRUN', 'led', 1300, 1800, { colour: 'green' }, { '2': V, '1': 'LRA' }, 1)
    .part('RLR', 'resistor', 1300, 1900, { value: '2.2k' }, { '1': 'LRA', '2': 'KP' }, 1)
    .part('LFL', 'led', 1400, 1800, { colour: 'red' }, { '2': 'FLTQ', '1': 'LFA' }, 1)
    .part('RLF', 'resistor', 1400, 1900, { value: '4.7k' }, { '1': 'LFA', '2': 'GND' }, 1)
    .part('LDR', 'led', 1500, 1800, { colour: 'yellow' }, { '2': V, '1': 'LDA' }, 1)
    .part('RLD', 'resistor', 1500, 1900, { value: '2.2k' }, { '1': 'LDA', '2': 'WDO' }, 1)
    // electrode terminals (to the tank and the source)
    .part('X7', 'terminal', -1250, 1550, { value: 'tank COM' }, { '1': 'EC1' })
    .part('X7R', 'terminal', -1250, 1490, { value: 'tank COM return' }, { '1': 'ER1' })
    .part('X11R', 'terminal', -1250, 1910, { value: 'source COM return' }, { '1': 'ER2' })
    .part('X8', 'terminal', -1250, 1610, { value: 'tank LOW' }, { '1': 'EL' })
    .part('X9', 'terminal', -1250, 1670, { value: 'tank HIGH' }, { '1': 'EH' })
    .part('X10', 'terminal', -1250, 1730, { value: 'tank OVERFLOW' }, { '1': 'EO' })
    .part('X11', 'terminal', -1250, 1790, { value: 'source COM' }, { '1': 'EC2' })
    .part('X12', 'terminal', -1250, 1850, { value: 'source DRY' }, { '1': 'ED' });
  // the pump (test load): a 1.1 kW single-phase motor at its rated slip
  nb.block('load').part('MP', 'motor1', 1850, 1650, { value: '0.05' }, { '1': 'LM', '2': 'NM' });
  if (o.k1Shorted) nb.block('bench').part('RK1SH', 'resistor', 1300, 1600, { value: '1' }, { '1': 'KP', '2': 'GND' });
  // a welded KM: its poles and its auxiliary held closed
  if (o.kmWelded) nb.block('bench').part('RWL', 'resistor', 1700, 1550, { value: '0.002' }, { '1': 'LQ2', '2': 'LM' })
    .part('RWN', 'resistor', 1700, 1600, { value: '0.002' }, { '1': 'NQ2', '2': 'NM' })
    .part('RWA', 'resistor', 1700, 1650, { value: '1' }, { '1': 'VF', '2': 'VFM' });
  nb.v('LVL').v('RUNQ').v('PERMIT').v('FLTQ').v('DOKE').v('DSQ').v('RDY');
  nb.sim({ type: 'tran', stop: o.stop ?? '30', step: o.step ?? '1m', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
