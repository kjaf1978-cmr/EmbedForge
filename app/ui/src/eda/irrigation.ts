// P9 (D24): automatic irrigation, up to 64 zones with soil-moisture sensors. The sequencing runs on
// a microcontroller board (D24: simulated with the board emulation of Increment 4); the circuits
// around it are discrete and simulated here: the 24 V DC valve drivers, the shared overcurrent
// cut-off and the protected sensor inputs.
//
// The product: 64 valve outputs from eight 74HC595 shift registers on 3.3 V (the microcontroller's
// SPI; at 3.3 V of gate drive a shorted valve's current stays within the MOSFET's 11 A pulse
// rating: at 5 V it reached 17 A, found in simulation), each through 1k into an IRLML0060 (60 V) with a Schottky flyback diode across the
// valve and an SMAJ33A on the field terminal (long valve cables pick up surges); all valve
// currents return through one 0.1 Ω shunt: above 2 A (a shorted valve or cable) a latching
// comparator takes every 74HC595 output off (OE high; it also trips itself at power-up, so the
// outputs stay off until the firmware has loaded the registers and cleared it), pulls every gate down (a BAT54 per channel
// and one transistor) and tells the microcontroller, which
// clears it (CLR) and skips the zone. 64 sensor inputs (0–3 V capacitive soil-moisture probes,
// powered from 3.3 V) each through an SMAJ5.0A, 10k, two Schottky clamps to 0 V and 3.3 V and 100 nF into four
// CD4067 multiplexers to the microcontroller's ADC. 24 V from a DIN-rail supply (fused), 5 V for
// the logic from it (7805), 3.3 V for the sensors (LM1117-3.3 on the microcontroller board).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

export interface IrrigationOptions {
  /** The test: valve 1 switched on at 1 ms and off at `offAt`; valve 2 (off) shorted at its
   *  terminal from `shortAt` (valve 1 shorted while on); a 1.2/50 µs surge of `surgeKv` on valve 2's cable at `surgeAt`; a
   *  surge on sensor 1's cable. */
  offAt?: number; shortAt?: number; surgeKv?: number; surgeAt?: number; sensorSurgeKv?: number;
  /** The registers' power-up state: output 2 high from power-up until the firmware loads the
   *  registers at 0.3 ms (they power up at random). */
  q2Random?: boolean;
  stop?: string;
}

export function irrigationFront(o: IrrigationOptions = {}): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  nb.para('IRRIGATION CONTROLLER, field interface (two of the 64 valve channels, the overcurrent cut-off, one of the 64 sensor inputs). Valves 24 V DC (0.45 A inrush, 0.3 A hold); sensors 0–3 V.', -1200, -300);
  // ---- test bench: the 24 V supply, the 5 V logic rail, the microcontroller's outputs
  nb.block('bench').note('TEST BENCH: supplies, the microcontroller, the field (not part of the board)', -1200, -150)
    .part('V24', 'battery', -1150, 0, { value: '24', rint: '0.05' }, { '1': 'V24', '2': 'GND' }, 1)
    .part('V5', 'battery', -1050, 0, { value: '5', rint: '0.05' }, { '1': 'V5', '2': 'GND' }, 1)
    .part('V33', 'battery', -950, 0, { value: '3.3', rint: '0.05' }, { '1': 'V33', '2': 'GND' }, 1)
    // the 74HC595 output for zone 1: high from 5 ms to offAt (the register's 50 Ω output)
    .part('VG1', 'vpulse', -850, 0, { value: '3.3', low: '0', freq: '1', duty: String(((o.offAt ?? 0.5) - 5e-3) * 100), delay: '5m', edge: '20n' }, { '1': 'Q1R', '2': 'GND' })
    .part('RQ1', 'resistor', -750, 0, { value: '50' }, { '1': 'Q1R', '2': 'Q1' })
    .part('RQ2', 'resistor', -750, 100, { value: '50' }, { '1': o.q2Random ? 'Q2R' : 'GND', '2': 'Q2' })
    // the firmware: registers loaded at 0.3 ms, the cut-off cleared (CLR) at 4 … 4.1 ms
    .part('VCL', 'vpulse', -850, 400, { value: '3.3', low: '0', freq: '1', duty: '0.01', delay: '4m', edge: '1u' }, { '1': 'CLR', '2': 'GND' })
    // the valves: 24 V DC solenoids, 53 Ω and 0.35 H (0.45 A at 24 V... their hold 0.3 A comes from
    // their plunger's air gap closing; as a model 80 Ω with 0.5 H gives the hold current)
    .part('RV1', 'resistor', -650, 200, { value: '80', pmax: '20' }, { '1': 'V24', '2': 'LV1' }, 1)
    .part('LV1', 'inductor', -650, 300, { value: '0.5', imax: '2' }, { '1': 'LV1', '2': 'OUT1' }, 1)
    .part('RV2', 'resistor', -550, 200, { value: '80', pmax: '20' }, { '1': 'V24', '2': 'LV2' }, 1)
    .part('LV2', 'inductor', -550, 300, { value: '0.5', imax: '2' }, { '1': 'LV2', '2': 'OUT2' }, 1)
    // the sensor: 1.5 V through its 1k output resistance and 100 m of cable (50 Ω)
    .part('VSN', 'battery', -450, 200, { value: '1.5', rint: '1050' }, { '1': 'SEN1', '2': 'GND' }, 1);
  // valve 1 shorted (its coil or its cable) while it is on: V24 straight onto the driver
  if (o.q2Random) nb.part('VQ2', 'vpulse', -850, 100, { value: '3.3', low: '0', freq: '1', duty: '0.03', delay: '0', edge: '20n' }, { '1': 'Q2R', '2': 'GND' });
  if (o.shortAt !== undefined) nb.part('VSH', 'vpulse', -350, 200, { value: '24', low: '0', freq: '1', duty: '90', delay: String(o.shortAt), edge: '1u' }, { '1': 'SHG', '2': 'OUT1' })
    .part('QSH', 'nmos', -250, 200, { value: 'IRLZ44N' }, { '1': 'SHG', '2': 'V24', '3': 'OUT1' });
  if (o.surgeKv) nb.part('VSG', 'vsurge', -350, 400, { value: `${o.surgeKv}k`, rsrc: '12', delay: String(o.surgeAt ?? 2e-3) }, { '1': 'OUT2', '2': 'GND' });
  if (o.sensorSurgeKv) nb.part('VSS', 'vsurge', -250, 400, { value: `${o.sensorSurgeKv}k`, rsrc: '42', delay: '2m' }, { '1': 'SEN1', '2': 'GND' });

  // ---- valve channels: gate 100 Ω and 100k, IRLML0060, flyback SS14 across the valve (drain to
  // 24 V), SMAJ33A drain to ground, sources to the shared shunt return SRET
  nb.block('valves');
  for (const k of [1, 2]) {
    const x = 200 * (k - 1);
    nb.part(`RG${k}`, 'resistor', x, 500, { value: '1k' }, { '1': `Q${k}`, '2': `G${k}` })
      .part(`RGS${k}`, 'resistor', x + 60, 600, { value: '10k' }, { '1': `G${k}`, '2': 'SRET' }, 1)
      .part(`DGC${k}`, 'diode', x + 60, 400, { value: 'BAT54' }, { '2': `G${k}`, '1': 'GCL' })
      .part(`QV${k}`, 'nmos', x + 120, 500, { value: 'IRLML0060' }, { '1': `G${k}`, '2': `OUT${k}`, '3': 'SRET' })
      .part(`DF${k}`, 'diode', x + 120, 380, { value: 'SS34' }, { '2': `OUT${k}`, '1': 'V24' }, 3)
      .part(`DT${k}`, 'tvs', x + 180, 600, { value: 'SMAJ33A' }, { '1': `OUT${k}`, '2': 'GND' }, 1)
      .part(`XV${k}`, 'terminal', x + 180, 400, { value: `valve ${k}` }, { '1': `OUT${k}` });
  }
  // ---- overcurrent: SRET → 0.1 Ω → ground; above 0.2 V (2 A) LM393 A trips and holds itself
  // (its output pulls its + input low through DOC): OCN low = all outputs off (the registers' OE
  // through the transistor QOE) and an interrupt; CLR (the microcontroller) releases it
  nb.block('overcurrent')
    .part('RSH', 'resistor', 400, 700, { value: '0.1', pmax: '1' }, { '1': 'SRET', '2': 'GND' }, 1)
    .part('RSF', 'resistor', 500, 600, { value: '1k' }, { '1': 'SRET', '2': 'SRF' })
    .part('CSF', 'capacitor', 580, 700, { value: '1n', vmax: '50' }, { '1': 'SRF', '2': 'GND' }, 1)
    .part('ROC1', 'resistor', 650, 500, { value: '22.1k' }, { '1': 'V5', '2': 'VOC' }, 1)
    .part('ROC2', 'resistor', 650, 620, { value: '1k' }, { '1': 'VOC', '2': 'GND' }, 1)
    .part('UOC', 'comparator', 800, 600, { value: 'LM393', pkg: 'OC' }, { '3': 'VOC', '2': 'SRF', '1': 'OCN', '8': 'V5', '4': 'GND' })
    .part('ROCP', 'resistor', 900, 500, { value: '10k' }, { '1': 'V5', '2': 'OCN' }, 1)
    // OE of the 74HC595s: high (off) while OCN is low (QOE PNP pulls OE up)
    .part('ROE1', 'resistor', 950, 600, { value: '10k' }, { '1': 'OCN', '2': 'BOE' })
    .part('QOE', 'pnp', 1050, 600, { value: 'BC557B' }, { '1': 'BOE', '2': 'OE', '3': 'V33' })
    // and every gate pulled down at once (BAT54 per channel into GCL, QPD): the registers' outputs
    // going high-impedance alone left the gates on their 10k for microseconds
    .part('RPD', 'resistor', 1150, 450, { value: '4.7k' }, { '1': 'OE', '2': 'BPD' })
    .part('QPD', 'npn', 1250, 450, { value: '2N2222A' }, { '1': 'BPD', '2': 'GCL', '3': 'GND' })
    .part('ROE2', 'resistor', 1050, 720, { value: '10k' }, { '1': 'OE', '2': 'GND' }, 1)
    // power-up: the registers come up at random, so the cut-off trips itself (CPOR lifts the latch
    // feed for about 1 ms; a 100k pull-up on OE alone was loaded down to 0.7 V by QPD and the
    // latch, found in simulation): every output off until the firmware has loaded the registers
    // and cleared it (CLR)
    // (through DPOR, so the latch's own feed through RLT stays fast)
    .part('CPOR', 'capacitor', 1250, 650, { value: '10n', vmax: '50' }, { '1': 'V5', '2': 'POR' })
    .part('RPOR', 'resistor', 1350, 650, { value: '100k' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('DPOR', 'diode', 1300, 600, { value: '1N4148' }, { '2': 'POR', '1': 'LTA' })
    // the latch: OE high holds the sense input at 0.4 V (10k and DLT into the 1k from the shunt),
    // above the 0.22 V threshold, until the microcontroller's CLR (QCL) pulls it low
    .part('RLT', 'resistor', 1150, 600, { value: '10k' }, { '1': 'OE', '2': 'LTA' })
    .part('DLT', 'diode', 1150, 700, { value: '1N4148' }, { '2': 'LTA', '1': 'SRF' })
    .part('RCL', 'resistor', 1250, 800, { value: '10k' }, { '1': 'CLR', '2': 'BCL' })
    .part('QCL', 'npn', 1350, 800, { value: 'BC547B' }, { '1': 'BCL', '2': 'SRF', '3': 'GND' })
    .part('RCLD', 'resistor', 1250, 900, { value: '100k' }, { '1': 'CLR', '2': 'GND' }, 1)
    .part('UOC2', 'comparator', 800, 800, { value: 'LM393', pkg: 'OC' }, { '3': 'GND', '2': 'V5', '1': 'GND', '8': 'V5', '4': 'GND' })
    .part('COC', 'capacitor', 900, 800, { value: '100n', vmax: '50' }, { '1': 'V5', '2': 'GND' }, 1);

  // ---- sensor input 1: an SMAJ5.0A at the terminal, 10k, BAT54 clamps to 0 V and 3.3 V, 100 nF,
  // into the multiplexer's input (1k and the BAT54s alone let a 1 kV line surge through at 6.8 V
  // and burnt 6 W in the 1k, found in simulation)
  nb.block('sensors')
    .part('XS1', 'terminal', 0, 900, { value: 'sensor 1' }, { '1': 'SEN1' })
    .part('DTS1', 'tvs', 50, 980, { value: 'SMAJ5.0A' }, { '1': 'SEN1', '2': 'GND' }, 1)
    .part('RS1', 'resistor', 100, 900, { value: '10k' }, { '1': 'SEN1', '2': 'MX1' })
    .part('DSH1', 'diode', 200, 820, { value: 'BAT54' }, { '2': 'MX1', '1': 'V33' }, 3)
    .part('DSL1', 'diode', 200, 980, { value: 'BAT54' }, { '2': 'GND', '1': 'MX1' }, 3)
    .part('CS1', 'capacitor', 300, 980, { value: '100n', vmax: '50' }, { '1': 'MX1', '2': 'GND' }, 1)
    // the multiplexer's input (CD4067 on 5 V: its own input diodes and leakage, as 1 MΩ)
    .part('RMX', 'resistor', 400, 980, { value: '1M' }, { '1': 'MX1', '2': 'GND' }, 1);
  nb.v('OUT1').v('OUT2').v('OCN').v('MX1').v('OE').v('G2').v('GCL').v('BPD').v('POR').v('LTA').v('SRF').i('QV1', '2').i('QV2', '2').i('RV2', '1').i('QCL', '2');
  nb.sim({ type: 'tran', stop: o.stop ?? '40m', step: '1u', start: 'zero', thin: true });
  return { sheet: nb.done(), nb };
}
