// P9 (D24): the irrigation controller as a product, for its boards: a main board and up to eight
// 8-zone channel modules (64 zones), joined by a 20-way ribbon cable. A single 64-zone board would
// need about 250 field terminals (two poles per valve, three per sensor): the modules put eight
// zones' terminals along one edge each, and a smaller installation fits fewer.
//
// Each channel module: two 74HC595 on the shift-register chain (the first drives the eight valves,
// the second enables the module's multiplexer; its QH' feeds the next module), a 74HC4051 for the
// eight sensors onto the shared analogue line, and the eight valve channels and eight sensor inputs
// exactly as simulated in irrigation.ts (`irrigationFront`): gate 1k and 10k, IRLML0060, SS34
// across the valve, SMAJ33A at the terminal, BAT54 into the shared gate pull-down; SMAJ5.0A, 10k,
// two BAT54 clamps and 100 nF on each sensor.
//
// The main board: 24 V in (fuse, reverse-polarity Schottky, SMAJ33A), 5 V from a switching
// regulator (R-78E5.0, the 7805's footprint: 19 V × 0.6 A in a 7805 would be 11 W), 3.3 V for the
// registers, multiplexers and sensors (AMS1117), the sensors' supply switched (AO3401: powered only
// while the firmware scans them, 64 probes draw about 0.3 A), the ESP32 module on sockets, and the
// overcurrent cut-off of irrigation.ts (the 0.1 Ω shunt in the valves' common return SRET, the
// latch, OE and the gates' pull-down), its state read by the module on OE.
//
// The bus (IDC 2 × 10): 1, 2 V24; 3, 4 SRET (the valves' return to the shunt); 5, 6, 18, 19, 20 GND;
// 7 V33; 8 V33S (sensors); 9 SER (in at a module's J_IN; at its J_OUT the chain's continuation);
// 10 SRCLK; 11 RCLK; 12 OE; 13 GCL; 14–16 A0–A2 (the multiplexers' address); 17 ANA (the selected
// sensor). Two conductors carry V24 and SRET each: the firmware opens one valve at a time (two
// at most, 0.9 A of inrush); the cut-off trips at 2 A.
//
// Firmware duties (D24, the board emulation of Increment 4): after power-up load all registers
// (every bit 0, each module's multiplexer bit 1 = off), then pulse CLR; scan: sensors' supply on
// (IO26 low), 20 ms, per module enable its multiplexer, set A0–A2, read IO36; run a zone: its bit 1,
// RCLK; watch OE (IO34): high means the cut-off tripped (a shorted valve or cable): clear all bits,
// mark the zone, pulse CLR. A watchdog and a run-time limit per zone (DFMEA IR-4).

import { NB } from './powerExamples';
import type { Sheet } from './schematic';

/** The bus pins (IDC 2 × 10) and their nets; SER is the chain's input at J_IN and output at J_OUT. */
export const IRR_BUS: Record<string, string> = {
  '1': 'V24', '2': 'V24', '3': 'SRET', '4': 'SRET', '5': 'GND', '6': 'GND', '7': 'V33', '8': 'V33S', '9': 'SER', '10': 'SRCLK',
  '11': 'RCLK', '12': 'OE', '13': 'GCL', '14': 'A0', '15': 'A1', '16': 'A2', '17': 'ANA', '18': 'GND', '19': 'GND', '20': 'GND',
};

/** One 8-zone channel module. */
export function irrigationModule(): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  nb.para('IRRIGATION CONTROLLER, 8-zone channel module (one of up to eight on the ribbon bus): valve drivers, sensor inputs, shift registers, multiplexer.', -200, -300);
  nb.block('bus')
    .part('J_IN', 'idc20', -150, 0, { value: 'IDC 2×10' }, { ...IRR_BUS })
    .part('J_OUT', 'idc20', 1750, 0, { value: 'IDC 2×10' }, { ...IRR_BUS, '9': 'SO' })
    .part('CV24', 'capacitor_pol', -50, 200, { value: '47u', vmax: '50' }, { '1': 'V24', '2': 'GND' }, 1)
    .part('CV33', 'capacitor_pol', 30, 200, { value: '10u', vmax: '16' }, { '1': 'V33', '2': 'GND' }, 1);
  nb.block('registers')
    .part('U1', 'hc595', 150, 0, { value: '74HC595' }, { '14': 'SER', '11': 'SRCLK', '12': 'RCLK', '13': 'OE', '10': 'V33', '16': 'V33', '8': 'GND', '15': 'Q1', '1': 'Q2', '2': 'Q3', '3': 'Q4', '4': 'Q5', '5': 'Q6', '6': 'Q7', '7': 'Q8', '9': 'SR2' })
    .part('U2', 'hc595', 450, 0, { value: '74HC595' }, { '14': 'SR2', '11': 'SRCLK', '12': 'RCLK', '13': 'OE', '10': 'V33', '16': 'V33', '8': 'GND', '15': 'MXEN', '9': 'SO' })
    // the multiplexer off while the registers' outputs are off (OE high at power-up and on a fault)
    .part('RMXE', 'resistor', 620, -100, { value: '10k' }, { '1': 'V33', '2': 'MXEN' }, 1)
    // OE held high (outputs off) if the ribbon's OE conductor breaks; 1 MΩ, so eight modules
    // (125 kΩ) against the main board's 10 kΩ still leave OE at 0.25 V when it is low
    .part('ROEU', 'resistor', 300, -100, { value: '1M' }, { '1': 'V33', '2': 'OE' }, 1)
    .part('CD1', 'capacitor', 150, -150, { value: '100n', vmax: '50' }, { '1': 'V33', '2': 'GND' }, 1)
    .part('CD2', 'capacitor', 450, -150, { value: '100n', vmax: '50' }, { '1': 'V33', '2': 'GND' }, 1)
    .part('U3', 'hc4051', 800, 0, { value: '74HC4051' }, { '13': 'MX1', '14': 'MX2', '15': 'MX3', '12': 'MX4', '1': 'MX5', '5': 'MX6', '2': 'MX7', '4': 'MX8', '11': 'A0', '10': 'A1', '9': 'A2', '6': 'MXEN', '3': 'ANA', '16': 'V33', '8': 'GND', '7': 'GND' })
    .part('CD3', 'capacitor', 800, -150, { value: '100n', vmax: '50' }, { '1': 'V33', '2': 'GND' }, 1);
  nb.block('valves');
  for (let k = 1; k <= 8; k++) {
    const x = 150 * (k - 1);
    nb.part(`RG${k}`, 'resistor', x, 400, { value: '1k' }, { '1': `Q${k}`, '2': `G${k}` })
      .part(`RGS${k}`, 'resistor', x + 50, 480, { value: '10k' }, { '1': `G${k}`, '2': 'SRET' }, 1)
      .part(`DGC${k}`, 'diode', x + 50, 330, { value: 'BAT54' }, { '2': `G${k}`, '1': 'GCL' })
      .part(`QV${k}`, 'nmos', x + 100, 400, { value: 'IRLML0060' }, { '1': `G${k}`, '2': `OUT${k}`, '3': 'SRET' })
      .part(`DF${k}`, 'diode', x + 100, 300, { value: 'SS34' }, { '2': `OUT${k}`, '1': 'V24' }, 3)
      .part(`DT${k}`, 'tvs', x + 130, 480, { value: 'SMAJ33A' }, { '1': `OUT${k}`, '2': 'GND' }, 1)
      .part(`XV${k}`, 'terminal', x + 130, 300, { value: `valve ${k}` }, { '1': `OUT${k}` })
      .part(`XVC${k}`, 'terminal', x + 130, 250, { value: `valve ${k} +24 V` }, { '1': 'V24' });
  }
  nb.block('sensors');
  for (let k = 1; k <= 8; k++) {
    const x = 150 * (k - 1);
    nb.part(`XS${k}`, 'terminal', x, 700, { value: `sensor ${k} out` }, { '1': `SEN${k}` })
      .part(`XSP${k}`, 'terminal', x, 650, { value: `sensor ${k} +3.3 V` }, { '1': 'V33S' })
      .part(`XSG${k}`, 'terminal', x, 750, { value: `sensor ${k} 0 V` }, { '1': 'GND' })
      .part(`DTS${k}`, 'tvs', x + 30, 780, { value: 'SMAJ5.0A' }, { '1': `SEN${k}`, '2': 'GND' }, 1)
      .part(`RS${k}`, 'resistor', x + 60, 700, { value: '10k' }, { '1': `SEN${k}`, '2': `MX${k}` })
      .part(`DSH${k}`, 'diode', x + 100, 640, { value: 'BAT54' }, { '2': `MX${k}`, '1': 'V33' }, 3)
      .part(`DSL${k}`, 'diode', x + 100, 760, { value: 'BAT54' }, { '2': 'GND', '1': `MX${k}` }, 3)
      .part(`CS${k}`, 'capacitor', x + 130, 760, { value: '100n', vmax: '50' }, { '1': `MX${k}`, '2': 'GND' }, 1);
  }
  return { sheet: nb.done(), nb };
}

/** The main board: supplies, the microcontroller module, the overcurrent cut-off, the bus. */
export function irrigationMain(): { sheet: Sheet; nb: NB } {
  const nb = new NB();
  nb.para('IRRIGATION CONTROLLER, main board: 24 V in, 5 V and 3.3 V, the ESP32 module, the overcurrent cut-off of every valve, the sensors\' supply, the bus to the channel modules.', -200, -300);
  nb.block('supply')
    .part('X24P', 'terminal', -150, 0, { value: '24 V DC in +' }, { '1': 'VIN' })
    .part('X24N', 'terminal', -150, 100, { value: '24 V DC in −' }, { '1': 'GND' })
    .part('F1', 'fuse', -50, 0, { value: '3.15' }, { '1': 'VIN', '2': 'VFU' })
    .part('DRP', 'diode', 50, 0, { value: 'SS34' }, { '2': 'VFU', '1': 'V24' })
    .part('DTV', 'tvs', 120, 100, { value: 'SMAJ33A' }, { '1': 'V24', '2': 'GND' }, 1)
    .part('CIN', 'capacitor_pol', 180, 100, { value: '220u', vmax: '50' }, { '1': 'V24', '2': 'GND' }, 1)
    .part('U5', 'regulator', 260, 0, { value: 'R-78E5.0-1.0' }, { '1': 'V24', '2': 'GND', '3': 'V5' })
    .part('C5', 'capacitor_pol', 340, 100, { value: '22u', vmax: '16' }, { '1': 'V5', '2': 'GND' }, 1)
    .part('U6', 'regulator', 420, 0, { value: 'AMS1117-3.3' }, { '1': 'V5', '2': 'GND', '3': 'V33' })
    .part('C33', 'capacitor_pol', 500, 100, { value: '22u', vmax: '16' }, { '1': 'V33', '2': 'GND' }, 1)
    // the sensors' supply, on while IO26 is low (100k keeps it off while the module boots)
    .part('RSSU', 'resistor', 600, -100, { value: '100k' }, { '1': 'V33', '2': 'SSG' }, 1)
    .part('RSSG', 'resistor', 600, 0, { value: '1k' }, { '1': 'SNSEN', '2': 'SSG' })
    .part('QSS', 'pmos', 700, 0, { value: 'AO3401' }, { '1': 'SSG', '2': 'V33S', '3': 'V33' })
    .part('CSS', 'capacitor_pol', 780, 100, { value: '10u', vmax: '16' }, { '1': 'V33S', '2': 'GND' }, 1);
  nb.block('microcontroller')
    // 5 V into the module's own regulator (its 3V3 pin left free: two regulators must not be paralleled)
    .part('U7', 'mcu', 400, 400, { value: 'ESP32-DevKitC-32E' }, {
      'J1-19': 'V5', 'J1-14': 'GND', 'J3-1': 'GND', 'J3-7': 'GND',
      'J3-2': 'SER', 'J3-9': 'SRCLK', 'J3-10': 'RCLK', 'J3-13': 'CLR', 'J1-5': 'OEI', 'J1-3': 'ANF',
      'J3-12': 'A0', 'J3-11': 'A1', 'J1-9': 'A2', 'J1-10': 'SNSEN',
    })
    // the analogue line into the ADC through 1k and 10 nF; OE (the cut-off's state) through 1k
    .part('RAN', 'resistor', 200, 450, { value: '1k' }, { '1': 'ANA', '2': 'ANF' })
    .part('CAN', 'capacitor', 250, 550, { value: '10n', vmax: '50' }, { '1': 'ANF', '2': 'GND' }, 1)
    .part('ROI', 'resistor', 200, 350, { value: '1k' }, { '1': 'OE', '2': 'OEI' })
    // the fault lamp: on while the cut-off holds every valve off
    .part('RLF', 'resistor', 600, 600, { value: '1k' }, { '1': 'OE', '2': 'LFA' })
    .part('LF', 'led', 650, 650, { value: 'red' }, { '1': 'LFA', '2': 'GND' }, 1)
    .part('J_BUS', 'idc20', 800, 400, { value: 'IDC 2×10' }, { ...IRR_BUS })
    // the bus lines held low while the module boots (its GPIO float until the firmware runs)
    .part('RPS1', 'resistor', 950, 250, { value: '10k' }, { '1': 'SER', '2': 'GND' }, 1)
    .part('RPS2', 'resistor', 1000, 250, { value: '10k' }, { '1': 'SRCLK', '2': 'GND' }, 1)
    .part('RPS3', 'resistor', 1050, 250, { value: '10k' }, { '1': 'RCLK', '2': 'GND' }, 1)
    .part('RPA0', 'resistor', 1100, 250, { value: '100k' }, { '1': 'A0', '2': 'GND' }, 1)
    .part('RPA1', 'resistor', 1150, 250, { value: '100k' }, { '1': 'A1', '2': 'GND' }, 1)
    .part('RPA2', 'resistor', 1200, 250, { value: '100k' }, { '1': 'A2', '2': 'GND' }, 1)
    .part('RANP', 'resistor', 1250, 250, { value: '1M' }, { '1': 'ANA', '2': 'GND' }, 1);
  // ---- the overcurrent cut-off (irrigation.ts, simulated there): SRET → 0.1 Ω → ground; above
  // 2 A the latch takes OE high (every register output off) and pulls every gate down (GCL), at
  // power-up too, until the firmware's CLR
  nb.block('overcurrent')
    .part('RSH', 'resistor', 400, 700, { value: '0.1', pmax: '1' }, { '1': 'SRET', '2': 'GND' }, 1)
    .part('RSF', 'resistor', 500, 600, { value: '1k' }, { '1': 'SRET', '2': 'SRF' })
    .part('CSF', 'capacitor', 580, 700, { value: '1n', vmax: '50' }, { '1': 'SRF', '2': 'GND' }, 1)
    .part('ROC1', 'resistor', 650, 500, { value: '22.1k' }, { '1': 'V5', '2': 'VOC' }, 1)
    .part('ROC2', 'resistor', 650, 620, { value: '1k' }, { '1': 'VOC', '2': 'GND' }, 1)
    .part('UOC', 'comparator', 800, 600, { value: 'LM393', pkg: 'OC' }, { '3': 'VOC', '2': 'SRF', '1': 'OCN', '8': 'V5', '4': 'GND' })
    .part('ROCP', 'resistor', 900, 500, { value: '10k' }, { '1': 'V5', '2': 'OCN' }, 1)
    .part('ROE1', 'resistor', 950, 600, { value: '10k' }, { '1': 'OCN', '2': 'BOE' })
    .part('QOE', 'pnp', 1050, 600, { value: 'BC557B' }, { '1': 'BOE', '2': 'OE', '3': 'V33' })
    .part('RPD', 'resistor', 1150, 450, { value: '4.7k' }, { '1': 'OE', '2': 'BPD' })
    .part('QPD', 'npn', 1250, 450, { value: '2N2222A' }, { '1': 'BPD', '2': 'GCL', '3': 'GND' })
    .part('ROE2', 'resistor', 1050, 720, { value: '10k' }, { '1': 'OE', '2': 'GND' }, 1)
    .part('CPOR', 'capacitor', 1250, 650, { value: '10n', vmax: '50' }, { '1': 'V5', '2': 'POR' })
    .part('RPOR', 'resistor', 1350, 650, { value: '100k' }, { '1': 'POR', '2': 'GND' }, 1)
    .part('DPOR', 'diode', 1300, 600, { value: '1N4148' }, { '2': 'POR', '1': 'LTA' })
    .part('RLT', 'resistor', 1150, 600, { value: '10k' }, { '1': 'OE', '2': 'LTA' })
    .part('DLT', 'diode', 1150, 700, { value: '1N4148' }, { '2': 'LTA', '1': 'SRF' })
    .part('RCL', 'resistor', 1250, 800, { value: '10k' }, { '1': 'CLR', '2': 'BCL' })
    .part('QCL', 'npn', 1350, 800, { value: 'BC547B' }, { '1': 'BCL', '2': 'SRF', '3': 'GND' })
    .part('RCLD', 'resistor', 1250, 900, { value: '100k' }, { '1': 'CLR', '2': 'GND' }, 1)
    .part('UOC2', 'comparator', 800, 800, { value: 'LM393', pkg: 'OC' }, { '3': 'GND', '2': 'V5', '1': 'GND', '8': 'V5', '4': 'GND' })
    .part('COC', 'capacitor', 900, 800, { value: '100n', vmax: '50' }, { '1': 'V5', '2': 'GND' }, 1);
  return { sheet: nb.done(), nb };
}
