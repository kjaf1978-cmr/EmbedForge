// P5 (D20): surge and lightning protection of an installation — coordinated surge protective
// devices (SPDs) of type 1, 2 and 3 in a mains house (TN-C-S), and the DC side of a PV house
// (the 48 V MPPT charger's array). Installation designs: DIN-rail SPDs, earthing and wiring,
// simulated with the surges of the standards (10/350 µs lightning current, 8/20 µs induced
// current, 1.2/50 µs combination wave). The cables are their inductance (about 1 µH per metre
// of a conductor in a building) and resistance; the coordination between the SPDs comes from
// the cable between them.

import { NB } from './powerExamples';
import type { Rot, Sheet } from './schematic';

export type MainsSurge = 'lightning' | 'lightning-L' | 'lps' | 'induced' | 'socket';

/** The mains house (TN-C-S, single phase), with DEHN SPDs: the service line (20 m), the main
 *  board with a type 1+2 DEHNshield TN 255 FM (941205: spark gaps L–PE and N–PE, Iimp 12.5 kA,
 *  Up ≤ 1.5 kV) at the PEN split to N and PE at the main earthing terminal (earth electrode
 *  10 Ω), 10 m to the sub-board with a type 2 DEHNguard MP TN ACI 275 FM (942220: L–PE varistor
 *  with a series spark gap, N–PE spark gap, In 20 kA, Up ≤ 1.5 kV), 15 m to the sensitive
 *  equipment's socket with a type 3 DEHNrail M 2P 255 (953200: L–N varistor, N–PE spark gap,
 *  V-wired) and an appliance (50 Ω, its Y capacitors). Each product is a package: its units one
 *  part. The SPDs' connections are their leads (`lead` µH per path, default 0.5: 0.5 m, the
 *  installation's limit, half in the line or N lead and half in the PE lead; the V-wired type 3
 *  only its PE lead, 60 % of `lead`).
 *  `surge`: `lightning`: a strike on the line, 25 kA 10/350 µs shared by L and PEN (12.5 kA
 *  each); `lightning-L`: 10/350 µs into L alone, `ka` (default 22.5) sized so that the DEHNshield's
 *  L–PE gap carries its Iimp of 12.5 kA (about half returns through the service line); `lps`: a
 *  strike on the building, 25 kA 10/350 µs into the main earthing terminal (half of a 50 kA
 *  class III/IV LPS current, IEC 62305-1); `induced`: 20 kA 8/20 µs into L; `socket`: 6 kV / 3 kA
 *  1.2/50 µs at the socket between L and N. `stages`: which SPDs are fitted; `cf`: the cables'
 *  capacitance as a factor (1: 100 pF/m); `ycap`: the appliance's Y capacitors. */
export function mainsHouse(surge: MainsSurge, stages: { t1?: boolean; t2?: boolean; t3?: boolean; ka?: number; lead?: number; cf?: number; ycap?: boolean } = {}): { sheet: Sheet; nb: NB } {
  const s = { t1: true, t2: true, t3: true, ka: 22.5, lead: 0.5, cf: 1, ycap: true, ...stages };
  const nb = new NB().wireUp([]).io({ PEN: 'in' }); // the PEN on a feed-through terminal (not bonded to the rail), then on the MET bar
  // the mains start at their positive peak (phase 90°) and the surge comes 0.1 ms later
  const at = 0.1e-3;
  const slow = surge === 'lightning' || surge === 'lightning-L' || surge === 'lps';
  nb.para('SURGE PROTECTION, mains house (TN-C-S), DEHN SPDs: type 1+2 DEHNshield TN 255 FM at the main board (PEN split), type 2 DEHNguard MP TN ACI 275 FM in the sub-board, type 3 DEHNrail M 2P 255 for the sensitive equipment, coordinated by the cables between them (10 m and 15 m). Main earthing terminal on a 10 Ω earth electrode; PEN split to N and PE at the main board.', -1200, -300);
  // ---- the supply (test bench): transformer 230 V, its PEN earthed at the substation (1 Ω)
  nb.block('bench').note('INPUT: the supply from the grid (service line) and the surge (TEST BENCH)', -1200, -150)
    .part('VS', 'vsin', -1150, 0, { value: '325', freq: '50', phase: '90' }, { '1': 'LS', '2': 'PENS' })
    .part('RES', 'resistor', -1050, 120, { value: '1', pmax: '1G' }, { '1': 'PENS', '2': 'GND' }, 1);
  // service line 20 m (overhead or buried): 20 µH and 30 mΩ per conductor
  const cable = (k: string, a: string, b: string, uh: number, mohm: number, x: number, y: number) =>
    nb.part(`LC${k}`, 'inductor', x, y, { value: `${uh}u`, imax: '30k' }, { '1': a, '2': `${k}M` }).part(`RC${k}`, 'resistor', x + 80, y, { value: `${mohm}m`, pmax: '1G' }, { '1': `${k}M`, '2': b });
  nb.block('service line');
  cable('SL', 'LS', 'L1', 20, 30, -950, 0); cable('SN', 'PENS', 'PEN1', 20, 30, -950, 100);
  // the cables' capacitance between conductors (about 100 pF per metre), at their receiving end:
  // it gives a spark gap's voltage a finite rise (without it an ideal surge source drives the
  // node to L·di/dt within one time step)
  const ccab = (k: string, a: string, b: string, nf: number, x: number, y: number) => nb.part(`CC${k}`, 'capacitor', x, y, { value: `${+(nf * s.cf).toFixed(3)}n`, vmax: '100k' }, { '1': a, '2': b }, 1);
  ccab('SL', 'L1', 'PEN1', 2, -800, 60);
  nb.block('bench');
  const w = slow ? '10/350' : '8/20', d = String(at);
  if (surge === 'lightning') nb.part('IS', 'isurge', -900, -100, { value: '12.5k', wave: w, delay: d }, { '1': 'L1', '2': 'GND' })
    .part('ISN', 'isurge', -900, 260, { value: '12.5k', wave: w, delay: d }, { '1': 'PEN1', '2': 'GND' });
  if (surge === 'lightning-L') nb.part('IS', 'isurge', -900, -100, { value: `${s.ka}k`, wave: w, delay: d }, { '1': 'L1', '2': 'GND' });
  if (surge === 'lps') nb.part('IS', 'isurge', -600, 300, { value: '25k', wave: w, delay: d }, { '1': 'PE1', '2': 'GND' });
  if (surge === 'induced') nb.part('IS', 'isurge', -900, -100, { value: '20k', wave: w, delay: d }, { '1': 'L1', '2': 'GND' });
  // ---- main board: PEN split at the main earthing terminal (MET), earth electrode 10 Ω
  nb.block('main board').note('MAIN BOARD', -750, -100)
    .part('XPEN', 'terminal', -750, 100, { value: 'PEN', wire: '16' }, { '1': 'PEN1' });
  nb.block('earthing').part('RPEN', 'resistor', -720, 180, { value: '0.5m', pmax: '1G' }, { '1': 'PEN1', '2': 'PE1' }, 1)
    .part('REL', 'resistor', -550, 200, { value: '10', pmax: '1G' }, { '1': 'PE1', '2': 'GND' }, 1);
  // each SPD's leads: its line lead and its PE lead make up the `lead` of a path (half each, the
  // N lead as the L lead); the V-wired type 3 has only its PE lead
  const lead = (k: string, a: string, b: string, uh: number, x: number, y: number, r: Rot = 1) => { nb.block('SPD leads').part(`LL${k}`, 'inductor', x, y, { value: `${+uh.toFixed(3)}u`, imax: '30k' }, { '1': a, '2': b }, r); };
  const h = s.lead / 2;
  if (s.t1) { lead('T1L', 'L1', 'T1L', h, -700, 0, 0); lead('T1N', 'PEN1', 'T1N', h, -620, 120, 0); lead('T1E', 'T1E', 'PE1', h, -600, 260); }
  if (s.t2) { lead('T2L', 'L2', 'T2L', h, -200, -40, 0); lead('T2N', 'N2', 'T2N', h, -280, 120, 0); lead('T2E', 'T2E', 'PE2', h, -120, 260); }
  if (s.t3) lead('T3E', 'T3E', 'PE3', 0.6 * s.lead, 470, 300);
  // type 1+2: spark gaps with follow-current limitation, Up 1.5 kV; its N–PE gap lies across the
  // PEN split here
  nb.block('main board');
  if (s.t1) nb.part('FT1A', 'gdt', -650, 40, { value: 'DSH TN 255 FM', pkg: 'FT1' }, { '1': 'T1L', '2': 'T1E' }, 1)
    .part('FT1B', 'gdt', -580, 160, { value: 'DSH TN 255 FM', pkg: 'FT1' }, { '1': 'T1N', '2': 'T1E' }, 1);
  // ---- 10 m to the sub-board (10 mm²)
  nb.block('feeder');
  cable('FL', 'L1', 'L2', 10, 18, -450, 0); cable('FN', 'PEN1', 'N2', 10, 18, -450, 100); cable('FP', 'PE1', 'PE2', 10, 18, -450, 200);
  ccab('FL', 'L2', 'PE2', 1, -300, 60); ccab('FN', 'N2', 'PE2', 1, -330, 180);
  nb.block('sub-board').note('SUB-BOARD', -250, -100);
  // type 2 for TN: L–PE varistor behind its series spark gap (ACI), N–PE spark gap
  const T2 = 'DG MP TN ACI 275 FM';
  if (s.t2) nb.part('FT2A', 'mov', -150, 60, { value: T2, pkg: 'FT2' }, { '1': 'T2L', '2': 'FT2M' }, 1)
    .part('FT2B', 'gdt', -150, 160, { value: T2, pkg: 'FT2' }, { '1': 'FT2M', '2': 'T2E' }, 1)
    .part('FT2C', 'gdt', -250, 180, { value: T2, pkg: 'FT2' }, { '1': 'T2N', '2': 'T2E' }, 1);
  // ---- 15 m to the socket (2.5 mm²)
  nb.block('final circuit');
  cable('XL', 'L2', 'L3', 15, 110, 0, 0); cable('XN', 'N2', 'N3', 15, 110, 0, 100); cable('XP', 'PE2', 'PE3', 15, 110, 0, 200);
  ccab('XL', 'L3', 'PE3', 1.5, 150, 60); ccab('XN', 'N3', 'PE3', 1.5, 120, 180);
  nb.block('socket').note('SOCKET CIRCUIT OF SENSITIVE EQUIPMENT: type 3 SPD (DIN rail, at the outlets)', 200, -100);
  if (s.t3) nb.part('FT3A', 'mov', 220, 60, { value: 'DR M 2P 255', pkg: 'FT3' }, { '1': 'L3', '2': 'N3' }, 1)
    .part('FT3B', 'gdt', 420, 160, { value: 'DR M 2P 255', pkg: 'FT3' }, { '1': 'N3', '2': 'T3E' }, 1);
  // ---- the appliance (test load): 50 Ω (1 kW), its Y capacitors to PE
  nb.block('load').note('OUTPUT (load side): the appliance (test load)', 550, -100)
    .part('RAP', 'resistor', 550, 60, { value: '50', pmax: '1M' }, { '1': 'L3', '2': 'N3' }, 1);
  if (s.ycap) nb.part('CY1', 'capacitor', 650, 60, { value: '2.2n', vmax: '4000' }, { '1': 'L3', '2': 'PE3' }, 1)
    .part('CY2', 'capacitor', 750, 160, { value: '2.2n', vmax: '4000' }, { '1': 'N3', '2': 'PE3' }, 1);
  if (surge === 'socket') nb.block('bench').part('VSG', 'vsurge', 450, -60, { value: '6k', rsrc: '2', delay: String(at) }, { '1': 'L3', '2': 'N3' });
  nb.v('L3').v('N3').v('PE3').v('L1').v('PE1').v('L2').v('PE2').v('N2');
  nb.sim({ type: 'tran', stop: String(at + (slow ? 1.2e-3 : 0.25e-3)), step: '20n', start: 'op', thin: true });
  return { sheet: nb.done(), nb };
}

/** The PV house (the 48 V MPPT charger, P6): its array of 9 × 410 Wp (3 in series, 3 strings:
 *  112 V open circuit, 127 V at −10 °C, 42 A short circuit) on the roof, 25 m of DC cable (two
 *  16 mm² conductors, 2.3 % drop at the MPP) with its 6 mm² bonding conductor alongside, to the
 *  charger's input as P6 builds it: its varistor RVPV and TVS DTVP across PV+ and PV−, its
 *  188 µF of film capacitors from PV+ to the battery negative, and PV− reaching the battery
 *  negative only through QPV and QPV2 (IRFP4668, 200 V, back to back). The battery negative is
 *  bonded to PE (by the inverters, with their output's N). SPDs (D49): a certified type 2 PV SPD
 *  (IEC 61643-31) at each end, the DEHNguard M YPV SCI 150 in its Y circuit (three varistors:
 *  DC+ and DC− to a star point, the star point to PE; each path two varistors, Up ≤ 0.8 kV), each
 *  with its leads at the installation's limit (0.5 m, 0.5 µH): the FM version (952518, remote
 *  signalling contact) in the array's junction box and the 952513 beside the charger.
 *  Options: `ka` kA 8/20 µs (default 5; the SPDs' In is 10, Imax 20), DC+ to PE, injected `at`
 *  the array's end of the cable (induced, or a strike near the array) or the charger's end;
 *  `qpv`: the charger running (QPV on, its MPP current) or stopped (QPV off: at night, or after
 *  its fault latch; its capacitors then hold the battery's voltage through the buck's body
 *  diode); `ldec` µH: the decoupling chokes in DC+ and DC− between the charger's SPD and the
 *  charger (default 68; 0: none); `trip`: no surge, the charger running until its fault latch
 *  opens QPV at 1 ms with the MPP current flowing (the chokes' energy); `cpvn` µF: P6's film capacitor across QPV and QPV2 (default
 *  47; 0: none); `tvs`, `spdArray`, `spdCharger`: fit those parts. */
export function pvHouse(o: { tvs?: boolean; spdArray?: boolean; spdCharger?: boolean; ka?: number; at?: 'array' | 'charger'; qpv?: boolean; ldec?: number; cpvn?: number; trip?: boolean } = {}): { sheet: Sheet; nb: NB } {
  const s = { tvs: true, spdArray: true, spdCharger: true, ka: 5, at: 'array', qpv: true, ldec: 68, cpvn: 47, trip: false, ...o };
  const nb = new NB().wireUp([]);
  const t0 = 1e-3;
  nb.para('SURGE PROTECTION, PV house (DC side): certified type 2 PV SPDs (DEHNguard M YPV SCI 150, UCPV 150 V DC, In 10 kA, Up ≤ 0.8 kV, Y circuit, SCI disconnector and status flag; the FM version with remote contact on the roof) at the array junction box and beside the charger; array frame, junction box, charger and the battery negative bonded to PE with a 6 mm² conductor beside the DC cable.', -1200, -300);
  nb.block('bench').note('INPUT: the PV array (9 × 410 Wp: 3 in series, 3 strings, as the 3.7 kW charger) and the surge (TEST BENCH)', -1200, -150)
    .part('PV1', 'pv', -1150, 0, { value: '410 Wp, 108 half-cells mono', ns: '3', np: '3', g: s.qpv ? '1000' : '0' }, { '1': 'PVA', '2': 'NVA' });
  const [sp, se] = s.at === 'array' ? ['PVA', 'PEA'] : ['PVC', 'PEC'];
  if (!s.trip) nb.part('IS', 'isurge', s.at === 'array' ? -950 : -560, -100, { value: `${s.ka}k`, wave: '8/20', delay: String(t0) }, { '1': sp, '2': se });
  // the SPD's leads (0.5 m in all) in its PE connection
  const leads = (k: string, a: string, b: string, x: number, y: number) => { nb.block('SPD leads').part(`LL${k}`, 'inductor', x, y, { value: '0.5u', imax: '30k' }, { '1': a, '2': b }, 1); };
  nb.block('array box').note('ARRAY JUNCTION BOX', -900, -100);
  // one SPD module, its three varistors (units A, B, C of FA1): DC+ – star, DC− – star, star – PE
  const yspd = (ref: string, value: string, p: string, n: string, pe: string, x: number) =>
    nb.part(`${ref}A`, 'mov', x, 60, { value, pkg: ref }, { '1': p, '2': `${ref}Y` }, 1)
      .part(`${ref}B`, 'mov', x + 160, 90, { value, pkg: ref }, { '1': n, '2': `${ref}Y` }, 3)
      .part(`${ref}C`, 'mov', x + 80, 220, { value, pkg: ref }, { '1': `${ref}Y`, '2': pe }, 1);
  if (s.spdArray) { yspd('FA1', 'DG M YPV SCI 150 FM', 'PVA', 'NVA', 'FA1P', -1030); leads('A', 'FA1P', 'PEA', -950, 340); }
  nb.block('dc cable');
  const cable = (k: string, a: string, b: string, mohm: number, x: number, y: number) =>
    nb.part(`LC${k}`, 'inductor', x, y, { value: '25u', imax: '10k' }, { '1': a, '2': `${k}M` }).part(`RC${k}`, 'resistor', x + 80, y, { value: `${mohm}m`, pmax: '1G' }, { '1': `${k}M`, '2': b });
  // DC+ and DC− 16 mm² (28 mΩ), the bonding conductor 6 mm² (77 mΩ), 25 m each
  cable('P', 'PVA', 'PVC', 28, -650, 0); cable('N', 'NVA', 'NVC', 28, -650, 100); cable('E', 'PEA', 'PEC', 77, -650, 200);
  nb.block('earthing').part('REC', 'resistor', -350, 400, { value: '10', pmax: '1G' }, { '1': 'PEC', '2': 'GND' }, 1);
  nb.block('charger input').note('CHARGER\'S PV ENCLOSURE', -400, -100);
  if (s.spdCharger) { yspd('FC1', 'DG M YPV SCI 150', 'PVC', 'NVC', 'FC1P', -500); leads('C', 'FC1P', 'PEC', -420, 330); }
  // decoupling chokes between the charger's SPD and the charger, in DC+ and DC− (P5 review B1,
  // B2): the SPD's Up (≤ 0.8 kV) is far above what the charger withstands (200 V MOSFETs, 250 V
  // capacitors); the chokes make the SPD take a surge that enters at either end and limit what
  // reaches the charger's capacitors. Air core, 68 µH: about 410 A at 20 kA without saturating
  // (`imax` is that peak; 52 A continuous)
  const [pi, ni] = s.ldec > 0 ? ['PVI', 'NVI'] : ['PVC', 'NVC'];
  nb.block('charger input');
  if (s.ldec > 0) nb.part('LDP', 'inductor', -300, 0, { value: `${s.ldec}u`, imax: '500' }, { '1': 'PVC', '2': 'PVI' })
    .part('LDN', 'inductor', -300, 140, { value: `${s.ldec}u`, imax: '500' }, { '1': 'NVC', '2': 'NVI' });
  // the charger's input as P6 builds it (powerExamples.ts, block pvin)
  nb.block('charger (P6)').note('CHARGER (P6) INPUT', -150, -100)
    .part('RVPV', 'mov', -150, 60, { value: '14D201K' }, { '1': pi, '2': ni }, 1);
  if (s.tvs) nb.part('DTVS', 'tvs', -40, 60, { value: '5KP130CA' }, { '1': pi, '2': ni }, 3);
  nb.part('CIN', 'capacitor', 80, 60, { value: '188u', vmax: '250' }, { '1': pi, '2': 'BN' }, 1)
    .part('QPV', 'nmos', 200, 250, { value: 'IRFP4668' }, { '1': 'GPV', '2': ni, '3': 'SPV' })
    .part('QPV2', 'nmos', 330, 300, { value: 'IRFP4668' }, { '1': 'GPV', '2': 'BN', '3': 'SPV' }, 2);
  // P6 change (P5 review B2): a film capacitor across QPV and QPV2 holds PV− to the battery
  // negative while QPV is off, as CIN holds PV+
  if (s.cpvn > 0) nb.part('CPVN', 'capacitor', 260, 150, { value: `${s.cpvn}u`, vmax: '250' }, { '1': ni, '2': 'BN' }, 1);
  nb.block('bench').note('TEST BENCH: the charger\'s gate drive, its MPP current or (stopped) the battery through the buck\'s body diode', 200, -100)
    .part('VG', s.trip ? 'vpulse' : 'vdc', 120, 420, s.trip ? { value: '12', low: '0', freq: '400', duty: '40', edge: '1u' } : { value: s.qpv ? '12' : '0' }, { '1': 'GPV', '2': 'SPV' }, 1);
  if (s.qpv) nb.part('RLD', 'resistor', 420, 60, { value: '2.4', pmax: '5k' }, { '1': pi, '2': 'BN' }, 1);
  else nb.part('VBAT', 'vdc', 420, 60, { value: '52' }, { '1': 'BATP', '2': 'BN' }, 1)
    .part('DBODY', 'diode', 520, 0, { value: 'STTH6003' }, { '1': 'BATP', '2': pi });
  // the battery negative bonded to PE (in the inverters, with their output's N)
  nb.block('earthing').part('RBOND', 'resistor', 420, 330, { value: '0.02', pmax: '100k' }, { '1': 'BN', '2': 'PEC' }, 1);
  nb.v(pi).v(ni).v('BN').v('PEC').v('PVA').v('PEA');
  nb.sim({ type: 'tran', stop: String(t0 + 0.15e-3), step: '0.05u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
