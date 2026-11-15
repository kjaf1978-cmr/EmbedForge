// P5 (D20): surge and lightning protection of an installation — coordinated surge protective
// devices (SPDs) of type 1, 2 and 3 in a mains house (TN-C-S), and the DC side of a PV house
// (the 48 V MPPT charger's array). Installation designs: DIN-rail SPDs, earthing and wiring,
// simulated with the surges of the standards (10/350 µs lightning current, 8/20 µs induced
// current, 1.2/50 µs combination wave). The cables are their inductance (about 1 µH per metre
// of a conductor in a building) and resistance; the coordination between the SPDs comes from
// the cable between them.

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export type MainsSurge = 'lightning' | 'induced' | 'socket';

/** The mains house (TN-C-S, single phase), with DEHN SPDs: the service line (20 m), the main
 *  board with a type 1+2 DEHNshield TN 255 FM (941205: spark gaps L–PE and N–PE, Iimp 12.5 kA,
 *  Up ≤ 1.5 kV) at the PEN split to N and PE at the main earthing terminal (earth electrode
 *  10 Ω), 10 m to the sub-board with a type 2 DEHNguard MP TN ACI 275 FM (942220: L–PE varistor
 *  with a series spark gap, N–PE spark gap, In 20 kA, Up ≤ 1.5 kV), 15 m to the sensitive
 *  equipment's socket with a type 3 DEHNrail M 2P 255 (953200: L–N varistor, N–PE spark gap) and
 *  an appliance (50 Ω, its Y capacitors). Each product is a package: its units one part. `surge`: 25 kA 10/350 µs from the service line to earth (lightning
 *  on the overhead line or the building's LPS), 20 kA 8/20 µs there (induced), or 6 kV / 3 kA
 *  1.2/50 µs at the socket between L and N. `stages`: which SPDs are fitted. */
export function mainsHouse(surge: MainsSurge, stages: { t1?: boolean; t2?: boolean; t3?: boolean } = {}): { sheet: Sheet; nb: NB } {
  const s = { t1: true, t2: true, t3: true, ...stages };
  const nb = new NB().wireUp([]).io({ PEN: 'pe' });
  // the mains start at their positive peak (phase 90°) and the surge comes 0.1 ms later
  const at = 0.1e-3;
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
  const ccab = (k: string, a: string, b: string, nf: number, x: number, y: number) => nb.part(`CC${k}`, 'capacitor', x, y, { value: `${nf}n`, vmax: '100k' }, { '1': a, '2': b }, 1);
  ccab('SL', 'L1', 'PEN1', 2, -800, 60);
  if (surge !== 'socket') nb.block('bench').part('IS', 'isurge', -900, -100, { value: surge === 'lightning' ? '12.5k' : '20k', wave: surge === 'lightning' ? '10/350' : '8/20', delay: String(at) }, { '1': 'L1', '2': 'GND' });
  // ---- main board: PEN split at the main earthing terminal (MET), earth electrode 10 Ω
  nb.block('main board').note('MAIN BOARD', -750, -100)
    .part('XPEN', 'terminal', -750, 100, { value: 'PEN', wire: '16' }, { '1': 'PEN1' });
  nb.block('earthing').part('RPEN', 'resistor', -720, 180, { value: '0.5m', pmax: '1G' }, { '1': 'PEN1', '2': 'PE1' }, 1)
    .part('REL', 'resistor', -550, 200, { value: '10', pmax: '1G' }, { '1': 'PE1', '2': 'GND' }, 1);
  // type 1+2: spark gaps with follow-current limitation, Up 1.5 kV (energy-coordinated by DEHN
  // with a type 3 within 10 m); its N–PE gap lies across the PEN split here
  // the connecting leads of the type 1+2 and type 2 SPDs at the installation's limit: 0.5 m in
  // all, about 0.5 µH; the type 3 is V-wired (the circuit runs through its terminals, 25 A)
  const leads = (k: string, a: string, x: number, y: number) => { nb.block('SPD leads').part(`LL${k}`, 'inductor', x, y, { value: '0.5u', imax: '30k' }, { '1': a, '2': `${k}L` }); };
  if (s.t1) leads('T1', 'L1', -700, 0);
  if (s.t2) leads('T2', 'L2', -200, -40);
  nb.block('main board');
  if (s.t1) nb.part('FT1A', 'gdt', -650, 40, { value: 'DSH TN 255 FM', pkg: 'FT1' }, { '1': 'T1L', '2': 'PE1' }, 1)
    .part('FT1B', 'gdt', -600, 160, { value: 'DSH TN 255 FM', pkg: 'FT1' }, { '1': 'PEN1', '2': 'PE1' }, 1);
  // ---- 10 m to the sub-board (10 mm²)
  nb.block('feeder');
  cable('FL', 'L1', 'L2', 10, 18, -450, 0); cable('FN', 'PEN1', 'N2', 10, 18, -450, 100); cable('FP', 'PE1', 'PE2', 10, 18, -450, 200);
  ccab('FL', 'L2', 'PE2', 1, -300, 60); ccab('FN', 'N2', 'PE2', 1, -330, 180);
  nb.block('sub-board').note('SUB-BOARD', -250, -100);
  // type 2 for TN: L–PE varistor behind its series spark gap (ACI), N–PE spark gap
  const T2 = 'DG MP TN ACI 275 FM';
  if (s.t2) nb.part('FT2A', 'mov', -150, 60, { value: T2, pkg: 'FT2' }, { '1': 'T2L', '2': 'FT2M' }, 1)
    .part('FT2B', 'gdt', -150, 160, { value: T2, pkg: 'FT2' }, { '1': 'FT2M', '2': 'PE2' }, 1)
    .part('FT2C', 'gdt', -250, 180, { value: T2, pkg: 'FT2' }, { '1': 'N2', '2': 'PE2' }, 1);
  // ---- 15 m to the socket (2.5 mm²)
  nb.block('final circuit');
  cable('XL', 'L2', 'L3', 15, 110, 0, 0); cable('XN', 'N2', 'N3', 15, 110, 0, 100); cable('XP', 'PE2', 'PE3', 15, 110, 0, 200);
  ccab('XL', 'L3', 'PE3', 1.5, 150, 60); ccab('XN', 'N3', 'PE3', 1.5, 120, 180);
  nb.block('socket').note('SOCKET CIRCUIT OF SENSITIVE EQUIPMENT: type 3 SPD (DIN rail, at the outlets)', 200, -100);
  if (s.t3) nb.part('FT3A', 'mov', 220, 60, { value: 'DR M 2P 255', pkg: 'FT3' }, { '1': 'L3', '2': 'N3' }, 1)
    .part('FT3B', 'gdt', 420, 160, { value: 'DR M 2P 255', pkg: 'FT3' }, { '1': 'N3', '2': 'PE3' }, 1);
  // ---- the appliance (test load): 50 Ω (1 kW), its Y capacitors to PE
  nb.block('load').note('OUTPUT (load side): the appliance (test load)', 550, -100)
    .part('RAP', 'resistor', 550, 60, { value: '50', pmax: '1M' }, { '1': 'L3', '2': 'N3' }, 1)
    .part('CY1', 'capacitor', 650, 60, { value: '2.2n', vmax: '4000' }, { '1': 'L3', '2': 'PE3' }, 1)
    .part('CY2', 'capacitor', 750, 160, { value: '2.2n', vmax: '4000' }, { '1': 'N3', '2': 'PE3' }, 1);
  if (surge === 'socket') nb.block('bench').part('VSG', 'vsurge', 450, -60, { value: '6k', rsrc: '2', delay: String(at) }, { '1': 'L3', '2': 'N3' });
  nb.v('L3').v('N3').v('PE3');
  nb.sim({ type: 'tran', stop: String(at + (surge === 'lightning' ? 1.2e-3 : 0.25e-3)), step: '20n', start: 'op', thin: true });
  return { sheet: nb.done(), nb };
}

/** The PV house (the 48 V MPPT charger, P6): its array of 9 × 410 Wp (3 in series, 3 strings:
 *  112 V open circuit, 127 V at −10 °C, 42 A short circuit) on the roof, 25 m of DC cable (two
 *  16 mm² conductors, 2.3 % drop at the MPP; their PE run alongside) to the charger's input (its
 *  188 µF of film capacitors and its MPP current as the test load). SPDs (D49): a certified
 *  type 2 PV SPD (IEC 61643-31) at each end, the DEHNguard M YPV SCI 150 in its Y circuit (three
 *  varistors: DC+ and DC− to a star point, the star point to PE; each path two varistors,
 *  Up ≤ 0.8 kV): the FM version (952518, remote signalling contact) in the array's junction box,
 *  whose status window nobody sees on the roof, and the 952513 beside the charger (its DC− is
 *  the battery's negative, bonded to PE); the charger's own 5 kW TVS across its input (its
 *  MOSFETs are 200 V parts). Surge: `ka` kA 8/20 µs (default 5; the SPDs' In is 10, Imax 20)
 *  induced into the cable at the array end (DC+ to the frame). `tvs`: fit the charger's TVS. */
export function pvHouse(o: { tvs?: boolean; spdArray?: boolean; spdCharger?: boolean; ka?: number } = {}): { sheet: Sheet; nb: NB } {
  const s = { tvs: true, spdArray: true, spdCharger: true, ka: 5, ...o };
  const nb = new NB().wireUp([]);
  const at = 1e-3;
  nb.para('SURGE PROTECTION, PV house (DC side): certified type 2 PV SPDs (DEHNguard M YPV SCI 150, UCPV 150 V DC, In 10 kA, Up ≤ 0.8 kV, Y circuit, SCI disconnector and status flag; the FM version with remote contact on the roof) at the array junction box and beside the charger, a 5 kW TVS across the charger input; array frame, junction box and charger earthed with a 6 mm² conductor beside the DC cable.', -1200, -300);
  nb.block('bench').note('INPUT: the PV array (9 × 410 Wp: 3 in series, 3 strings, as the 3.7 kW charger) and an induced surge (TEST BENCH)', -1200, -150)
    .part('PV1', 'pv', -1150, 0, { value: '410 Wp, 108 half-cells mono', ns: '3', np: '3', g: '1000' }, { '1': 'PVA', '2': 'NVA' })
    .part('RFR', 'resistor', -1050, 200, { value: '10', pmax: '1G' }, { '1': 'PEA', '2': 'GND' }, 1)
    .part('IS', 'isurge', -950, -100, { value: `${s.ka}k`, wave: '8/20', delay: String(at) }, { '1': 'PVA', '2': 'PEA' });
  nb.block('array box').note('ARRAY JUNCTION BOX', -900, -100);
  // one SPD module, its three varistors (units A, B, C of FA1): DC+ – star, DC− – star, star – PE
  const yspd = (ref: string, value: string, p: string, n: string, pe: string, x: number) =>
    nb.part(`${ref}A`, 'mov', x, 60, { value, pkg: ref }, { '1': p, '2': `${ref}Y` }, 1)
      .part(`${ref}B`, 'mov', x + 160, 90, { value, pkg: ref }, { '1': n, '2': `${ref}Y` }, 3)
      .part(`${ref}C`, 'mov', x + 80, 220, { value, pkg: ref }, { '1': `${ref}Y`, '2': pe }, 1);
  if (s.spdArray) yspd('FA1', 'DG M YPV SCI 150 FM', 'PVA', 'NVA', 'PEA', -980);
  nb.block('dc cable');
  const cable = (k: string, a: string, b: string, x: number, y: number) =>
    nb.part(`LC${k}`, 'inductor', x, y, { value: '25u', imax: '10k' }, { '1': a, '2': `${k}M` }).part(`RC${k}`, 'resistor', x + 80, y, { value: '28m', pmax: '1G' }, { '1': `${k}M`, '2': b });
  cable('P', 'PVA', 'PVC', -650, 0); cable('N', 'NVA', 'NVC', -650, 100); cable('E', 'PEA', 'PEC', -650, 200);
  nb.block('earthing').part('REC', 'resistor', -350, 300, { value: '10', pmax: '1G' }, { '1': 'PEC', '2': 'GND' }, 1);
  nb.block('charger input').note('CHARGER (P6) INPUT', -400, -100);
  if (s.spdCharger) yspd('FC1', 'DG M YPV SCI 150', 'PVC', 'NVC', 'PEC', -500);
  // the charger's own input (part of P6, not of this protection): its varistor and TVS
  nb.block('charger (P6)').part('RVPV', 'mov', -220, 60, { value: '14D201K' }, { '1': 'PVC', '2': 'NVC' }, 1);
  if (s.tvs) nb.part('DTVS', 'tvs', -80, 60, { value: '5KP130CA' }, { '1': 'PVC', '2': 'NVC' }, 3);
  nb.block('load').note('OUTPUT (load side): the charger (test load: its input capacitors and its MPP current)', 0, -100)
    .part('CIN', 'capacitor', 60, 60, { value: '188u', vmax: '250' }, { '1': 'PVC', '2': 'NVC' }, 1)
    .part('RLD', 'resistor', 200, 60, { value: '2.4', pmax: '5k' }, { '1': 'PVC', '2': 'NVC' }, 1)
    // the charger's PV− reaches its battery negative through QPV (on), and that is bonded to PE
    .part('RBOND', 'resistor', 340, 220, { value: '0.02', pmax: '100k' }, { '1': 'NVC', '2': 'PEC' }, 1);
  nb.v('PVC').v('NVC').v('PEC');
  nb.sim({ type: 'tran', stop: String(at + 0.1e-3), step: '0.05u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
