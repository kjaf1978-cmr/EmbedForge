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

/** The mains house (TN-C-S, single phase): the service line (20 m), the main board with a type 1
 *  spark gap (L–PE) and the PEN split to N and PE at the main earthing terminal (earth electrode
 *  10 Ω), 10 m to the sub-board with a type 2 SPD (L–PE) and a gas discharge tube N–PE ("1+1"),
 *  15 m to the socket with a type 3 SPD (varistors L–N and L–PE, GDT N–PE) and an appliance
 *  (50 Ω, its Y capacitors). `surge`: 25 kA 10/350 µs from the service line to earth (lightning
 *  on the overhead line or the building's LPS), 20 kA 8/20 µs there (induced), or 6 kV / 3 kA
 *  1.2/50 µs at the socket between L and N. `stages`: which SPDs are fitted. */
export function mainsHouse(surge: MainsSurge, stages: { t1?: boolean; t2?: boolean; t3?: boolean } = {}): { sheet: Sheet; nb: NB } {
  const s = { t1: true, t2: true, t3: true, ...stages };
  const nb = new NB();
  // the mains start at their positive peak (phase 90°) and the surge comes 0.1 ms later
  const at = 0.1e-3;
  nb.para('SURGE PROTECTION, mains house (TN-C-S): type 1 spark gap at the main board, type 2 SPD in the sub-board, type 3 at the socket of sensitive appliances, coordinated by the cables between them (10 m and 15 m). Main earthing terminal on a 10 Ω earth electrode; PEN split to N and PE at the main board.', -1200, -300);
  // ---- the supply (test bench): transformer 230 V, its PEN earthed at the substation (1 Ω)
  nb.block('bench').note('TEST BENCH: the supply and the surge', -1200, -150)
    .part('VS', 'vsin', -1150, 0, { value: '325', freq: '50', phase: '90' }, { '1': 'LS', '2': 'PENS' })
    .part('RES', 'resistor', -1050, 120, { value: '1', pmax: '1M' }, { '1': 'PENS', '2': 'GND' }, 1);
  // service line 20 m (overhead or buried): 20 µH and 30 mΩ per conductor
  const cable = (k: string, a: string, b: string, uh: number, mohm: number, x: number, y: number) =>
    nb.part(`LC${k}`, 'inductor', x, y, { value: `${uh}u`, imax: '30k' }, { '1': a, '2': `${k}M` }).part(`RC${k}`, 'resistor', x + 80, y, { value: `${mohm}m`, pmax: '1k' }, { '1': `${k}M`, '2': b });
  nb.block('service line');
  cable('SL', 'LS', 'L1', 20, 30, -950, 0); cable('SN', 'PENS', 'PEN1', 20, 30, -950, 100);
  if (surge !== 'socket') nb.block('bench').part('IS', 'isurge', -900, -100, { value: surge === 'lightning' ? '25k' : '20k', wave: surge === 'lightning' ? '10/350' : '8/20', delay: String(at) }, { '1': 'L1', '2': 'GND' });
  // ---- main board: PEN split at the main earthing terminal (MET), earth electrode 10 Ω
  nb.block('main board').note('MAIN BOARD', -750, -100)
    .part('XPEN', 'terminal', -750, 100, { value: 'PEN' }, { '1': 'PEN1' })
    .part('RPEN', 'resistor', -650, 160, { value: '0.5m' }, { '1': 'PEN1', '2': 'PE1' }, 1)
    .part('REL', 'resistor', -550, 200, { value: '10', pmax: '1M' }, { '1': 'PE1', '2': 'GND' }, 1);
  if (s.t1) nb.part('FT1', 'gdt', -650, 40, { value: 'Spark gap T1 255' }, { '1': 'L1', '2': 'PE1' }, 1);
  // ---- 10 m to the sub-board (10 mm²)
  nb.block('feeder');
  cable('FL', 'L1', 'L2', 10, 18, -450, 0); cable('FN', 'PEN1', 'N2', 10, 18, -450, 100); cable('FP', 'PE1', 'PE2', 10, 18, -450, 200);
  nb.block('sub-board').note('SUB-BOARD', -250, -100);
  if (s.t2) nb.part('FT2', 'mov', -250, 60, { value: 'SPD-T2 275' }, { '1': 'L2', '2': 'PE2' }, 1)
    .part('FT2N', 'gdt', -150, 160, { value: 'GDT 600 V' }, { '1': 'N2', '2': 'PE2' }, 1);
  // ---- 15 m to the socket (2.5 mm²)
  nb.block('final circuit');
  cable('XL', 'L2', 'L3', 15, 110, 0, 0); cable('XN', 'N2', 'N3', 15, 110, 0, 100); cable('XP', 'PE2', 'PE3', 15, 110, 0, 200);
  nb.block('socket').note('SOCKET: type 3 SPD (surge-protected outlet)', 200, -100);
  if (s.t3) nb.part('FT3', 'mov', 220, 60, { value: '14D431K' }, { '1': 'L3', '2': 'N3' }, 1)
    .part('FT3E', 'mov', 320, 60, { value: '14D431K' }, { '1': 'L3', '2': 'PE3' }, 1)
    .part('FT3N', 'gdt', 420, 160, { value: 'GDT 600 V' }, { '1': 'N3', '2': 'PE3' }, 1);
  // ---- the appliance (test load): 50 Ω (1 kW), its Y capacitors to PE
  nb.block('load').note('APPLIANCE (test load)', 550, -100)
    .part('RAP', 'resistor', 550, 60, { value: '50', pmax: '2k' }, { '1': 'L3', '2': 'N3' }, 1)
    .part('CY1', 'capacitor', 650, 60, { value: '2.2n', vmax: '4000' }, { '1': 'L3', '2': 'PE3' }, 1)
    .part('CY2', 'capacitor', 750, 160, { value: '2.2n', vmax: '4000' }, { '1': 'N3', '2': 'PE3' }, 1);
  if (surge === 'socket') nb.block('bench').part('VSG', 'vsurge', 450, -60, { value: '6k', rsrc: '2', delay: String(at) }, { '1': 'L3', '2': 'N3' });
  nb.v('L3').v('N3').v('PE3');
  nb.sim({ type: 'tran', stop: String(at + (surge === 'lightning' ? 1.2e-3 : 0.25e-3)), step: '20n', start: 'op', thin: true });
  return { sheet: nb.done(), nb };
}

/** The PV house (the 48 V MPPT charger, P6): three 280 Wp modules in series (115 V open
 *  circuit) on the roof, 25 m of DC cable (two 6 mm² conductors, their PE run alongside) to the
 *  charger's input. SPDs: at the array's junction box two varistors in Y (DC+ and DC− to PE,
 *  the array frame), and at the charger's input the same and a 5 kW TVS across the input
 *  (the charger's MOSFETs are 200 V parts). `surge`: 5 kA 8/20 µs induced into the cable at the
 *  array end (DC+ to the frame). `tvs`: fit the charger's input TVS. */
export function pvHouse(o: { tvs?: boolean; spdArray?: boolean; spdCharger?: boolean } = {}): { sheet: Sheet; nb: NB } {
  const s = { tvs: true, spdArray: true, spdCharger: true, ...o };
  const nb = new NB();
  const at = 1e-3;
  nb.para('SURGE PROTECTION, PV house (DC side): type 2 DC SPDs (two varistors in Y, 170 V DC) at the array junction box and at the charger, a 5 kW TVS across the charger input; array frame, junction box and charger earthed with a 6 mm² conductor beside the DC cable.', -1200, -300);
  nb.block('bench').note('TEST BENCH: the array (three 280 Wp in series) and an induced surge', -1200, -150)
    .part('PV1', 'pv', -1150, 0, { value: '280 Wp, 60 cells poly', n: '3', g: '1000' }, { '1': 'PVA', '2': 'NVA' })
    .part('RFR', 'resistor', -1050, 200, { value: '10', pmax: '100k' }, { '1': 'PEA', '2': 'GND' }, 1)
    .part('IS', 'isurge', -950, -100, { value: '5k', wave: '8/20', delay: String(at) }, { '1': 'PVA', '2': 'PEA' });
  nb.block('array box').note('ARRAY JUNCTION BOX', -900, -100);
  if (s.spdArray) nb.part('FA1', 'mov', -900, 60, { value: '20D201K' }, { '1': 'PVA', '2': 'PEA' }, 1)
    .part('FA2', 'mov', -800, 60, { value: '20D201K' }, { '1': 'NVA', '2': 'PEA' }, 1);
  nb.block('dc cable');
  const cable = (k: string, a: string, b: string, x: number, y: number) =>
    nb.part(`LC${k}`, 'inductor', x, y, { value: '25u', imax: '10k' }, { '1': a, '2': `${k}M` }).part(`RC${k}`, 'resistor', x + 80, y, { value: '75m', pmax: '1k' }, { '1': `${k}M`, '2': b });
  cable('P', 'PVA', 'PVC', -650, 0); cable('N', 'NVA', 'NVC', -650, 100); cable('E', 'PEA', 'PEC', -650, 200);
  nb.block('charger input').note('CHARGER (P6) INPUT', -400, -100)
    .part('REC', 'resistor', -350, 300, { value: '10', pmax: '100k' }, { '1': 'PEC', '2': 'GND' }, 1);
  if (s.spdCharger) nb.part('FC1', 'mov', -400, 60, { value: '20D201K' }, { '1': 'PVC', '2': 'PEC' }, 1)
    .part('FC2', 'mov', -300, 60, { value: '20D201K' }, { '1': 'NVC', '2': 'PEC' }, 1);
  // the charger's own input: its varistor and capacitors, its load (the converter at its MPP)
  nb.part('RVPV', 'mov', -200, 60, { value: '14D201K' }, { '1': 'PVC', '2': 'NVC' }, 1);
  if (s.tvs) nb.part('DTVS', 'tvs', -100, 60, { value: '5KP130A' }, { '1': 'PVC', '2': 'NVC' }, 1);
  nb.block('load').note('THE CHARGER (test load: its input capacitors and its MPP current)', 0, -100)
    .part('CIN', 'capacitor', 0, 60, { value: '20u', vmax: '200' }, { '1': 'PVC', '2': 'NVC' }, 1)
    .part('RLD', 'resistor', 100, 60, { value: '11.5', pmax: '2k' }, { '1': 'PVC', '2': 'NVC' }, 1)
    .part('CYC', 'capacitor', 200, 160, { value: '4.7n', vmax: '2000' }, { '1': 'NVC', '2': 'PEC' }, 1);
  nb.v('PVC').v('NVC').v('PEC');
  nb.sim({ type: 'tran', stop: String(at + 0.1e-3), step: '0.05u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
