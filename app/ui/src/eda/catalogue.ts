// Procurement data for the parts of the worked designs (decision D29): a manufacturer part number
// that matches the generic part, the distributors' order numbers where known, and an indicative
// unit price. Prices were taken from distributor pages and search snapshots in October 2026
// ("live") or are typical ranges ("estimate"); all in EUR without VAT, converted at
// USD × 0.9 and GBP × 1.15. They change: check them when ordering.

import type { BomLine } from './bom';
import { parseValue } from './units';

export interface Offer { distributor: string; sku?: string; url?: string }
export interface CatalogueEntry {
  mpn: string;
  maker: string;
  description: string;
  /** Unit price at quantity 1 and at 100 (EUR, without VAT). */
  price1: number;
  price100?: number;
  basis: 'live' | 'estimate';
  offers: Offer[];
  note?: string;
}

export const PRICE_DATE = 'October 2026';
export const PRICE_NOTE = `Indicative prices, ${PRICE_DATE}, EUR without VAT (converted at USD × 0.9, GBP × 1.15): "live" from a distributor page or snapshot, "estimate" a typical price. Check prices, stock and lead times when ordering; wholesale prices of contactors and breakers are often 40–60 % below distributor list prices.`;

const e = (mpn: string, maker: string, description: string, price1: number, price100: number | undefined, basis: 'live' | 'estimate', offers: Offer[] = [], note?: string): CatalogueEntry =>
  ({ mpn, maker, description, price1, price100, basis, offers, note });
const any = (what: string): Offer[] => [{ distributor: `any distributor (${what})` }];

/** Parts identified by symbol and value. */
const BY_VALUE: Record<string, Record<string, CatalogueEntry>> = {
  contactor: {
    '32 A, coil 24 V DC': e('LC1DT32BD + LADN01', 'Schneider Electric', 'contactor 4 NO, 32 A AC-1 (resistive and mixed loads), coil 24 V DC, with 1 NC auxiliary block; for motor loads above 7.5 kW use a 40 A AC-3 frame', 165, undefined, 'live',
      [{ distributor: 'RS', sku: '608-9914', url: 'https://at.rs-online.com/web/p/schutze/6089914' }, { distributor: 'RS (LADN01)', sku: '018-7891' }],
      'single-phase design: ABB ESB40-20N-01 (2 NO, 40 A AC-1, 24 V AC/DC) with EH04-11N auxiliary, about €70–90 at wholesale'),
    '150 A DC, coil 48 V': e('DC contactor 150 A, 48 V DC coil, 1 NO auxiliary (e.g. Albright SW180 series)', 'Albright / TE Connectivity', 'single-pole DC contactor, 150 A continuous at 60 V DC, 48 V DC coil, normally-open auxiliary contact (EN feedback)', 95, 70, 'estimate', [{ distributor: 'battery-systems distributor' }], 'order the 48 V coil and the auxiliary-contact option; check the breaking rating at 58 V DC'),
  },
  breaker1: { 'C10 A': e('S201-C10', 'ABB', 'miniature circuit breaker 1-pole, C 10 A, 6 kA', 8, 5, 'live', [{ distributor: 'electrical wholesale' }]) },
  breaker2: { 'C32 A': e('S201-C32NA', 'ABB', 'miniature circuit breaker 1P+N, C 32 A, 6 kA', 35, 25, 'estimate', [{ distributor: 'electrical wholesale' }]) },
  breaker4: { 'C32 A': e('S204-C32', 'ABB', 'miniature circuit breaker 4-pole, C 32 A, 6 kA', 187, 78, 'live', [{ distributor: 'RS', sku: '746-7817', url: 'https://ie.rs-online.com/web/p/mcbs/7467817' }], 'trade price about €78') },
  relay: { '12 V 30 A': e('832A-1C-S 12VDC', 'Song Chuan', 'power relay SPDT 30 A, coil 12 V DC (PCB)', 3.0, 2.1, 'estimate', [{ distributor: 'Mouser (832AWP variant)' }], 'alternative TE T9AP1D52-12 (SPDT)') },
  autotransformer: { '1 kVA 230 V, taps 150–280 V': e('made to specification', 'transformer winder (e.g. ABL Transfo or local)', 'autotransformer 1 kVA, 230 V output tap, taps 150/170/190/210/230/250/280 V, class F insulation, thermal cut-out in the winding', 185, 115, 'estimate', [{ distributor: 'transformer winder' }]) },
  mov: {
    '14D471K': e('S14K300 (B72214S0301K101)', 'TDK', 'varistor 14 mm, 300 V AC (14D471K)', 0.3, 0.09, 'live', [{ distributor: 'LCSC', sku: 'C125541' }, { distributor: 'Digi-Key' }]),
    '14D201K': e('S14K130 (B72214S0131K101)', 'TDK', 'varistor 14 mm, 130 V AC (14D201K)', 0.35, 0.1, 'estimate', [{ distributor: 'Bürklin', sku: '82E2229' }]),
  },
  nmos: {
    IRFP4668: e('IRFP4668PBFXKMA1', 'Infineon', 'MOSFET N 200 V 130 A, TO-247 (successor of IRFP4668PBF, end of life)', 4.75, 3.0, 'live', [{ distributor: 'Digi-Key' }, { distributor: 'LCSC', sku: 'C2921' }, { distributor: 'Farnell', sku: '1684526' }]),
    IRFP4468: e('IRFP4468PBFXKMA1', 'Infineon', 'MOSFET N 100 V 195 A, TO-247 (successor of IRFP4468PBF, end of life)', 5.1, 3.0, 'live', [{ distributor: 'Digi-Key', sku: 'IRFP4468PBF-ND' }, { distributor: 'LCSC', sku: 'C2919' }]),
    IRLZ44N: e('IRLZ44NPBF', 'Infineon', 'MOSFET N logic level 55 V 47 A, TO-220', 1.85, 0.75, 'live', [{ distributor: 'Mouser' }, { distributor: 'LCSC', sku: 'C38774' }]),
    IRF540N: e('IRF540NPBF', 'Infineon', 'MOSFET N 100 V 33 A, TO-220 (contactor coil switch)', 1.2, 0.55, 'estimate', any('TO-220')),
    '2N7000': e('2N7000', 'onsemi', 'MOSFET N 60 V 200 mA, TO-92', 0.2, 0.06, 'estimate', any('TO-92')),
  },
  diode: {
    STTH6003: e('STTH6003CW', 'STMicroelectronics', 'ultrafast diode 2 × 30 A 300 V, TO-247 (both diodes in parallel)', 2.55, 1.7, 'live', [{ distributor: 'Digi-Key' }, { distributor: 'RS', sku: '168-6090' }], 'lead times up to 25 weeks seen'),
    '1N5408': e('1N5408', 'various', 'rectifier diode 3 A 1000 V, DO-201AD', 0.15, 0.05, 'estimate', any('DO-201AD')),
    '1N4007': e('1N4007', 'various', 'rectifier diode 1 A 1000 V, DO-41', 0.1, 0.02, 'estimate', any('DO-41')),
    '1N4148': e('1N4148', 'various', 'signal diode 100 V 200 mA, DO-35', 0.06, 0.015, 'estimate', any('DO-35')),
  },
  zener: {
    BZX55C3V3: e('BZX55C3V3', 'Vishay', 'Zener diode 3.3 V 0.5 W, DO-35', 0.08, 0.02, 'estimate', any('DO-35')),
    BZX55C12: e('BZX55C12', 'Vishay', 'Zener diode 12 V 0.5 W, DO-35', 0.08, 0.02, 'estimate', any('DO-35')),
    BZX55C13: e('BZX55C13', 'Vishay', 'Zener diode 13 V 0.5 W, DO-35', 0.08, 0.02, 'estimate', any('DO-35')),
  },
  bridge: { DB107: e('DB107', 'various', 'bridge rectifier 1 A 1000 V, DIP-4', 0.3, 0.08, 'estimate', any('DIP-4')) },
  tvs: { '5KP64A': e('5KP64A', 'Littelfuse', 'TVS diode 5 kW, 64 V stand-off, P600', 1.55, 1.15, 'live', [{ distributor: 'Farnell', sku: '3392434', url: 'https://uk.farnell.com/littelfuse/5kp64a/tvs-diode-unidir-64v-p600/dp/3392434' }]) },
  hbdriver: { 'IR2184-type 600 V': e('IR2184PBF', 'Infineon', 'half-bridge gate driver 600 V, DIP-8', 2.05, 1.36, 'live', [{ distributor: 'RS', sku: '262-6254' }, { distributor: 'Schukat', sku: '3021391' }]) },
  comparator: {
    LM339: e('LM339N', 'Texas Instruments', 'quad comparator, open collector, DIP-14', 0.45, 0.2, 'estimate', any('DIP-14')),
    LM393: e('LM393P', 'Texas Instruments', 'dual comparator, open collector, DIP-8', 0.4, 0.15, 'estimate', any('DIP-8')),
  },
  opamp: {
    LM358: e('LM358P', 'Texas Instruments', 'dual op-amp, DIP-8', 0.35, 0.12, 'estimate', any('DIP-8')),
    TL071: e('TL071CP', 'Texas Instruments', 'single JFET op-amp, DIP-8', 0.6, 0.25, 'estimate', any('DIP-8')),
    TL072: e('TL072CP', 'Texas Instruments', 'dual JFET op-amp, DIP-8', 0.7, 0.3, 'estimate', any('DIP-8')),
    TL074: e('TL074CN', 'Texas Instruments', 'quad JFET op-amp, DIP-14', 0.6, 0.3, 'estimate', any('DIP-14')),
  },
  tl431: { TL431: e('TL431ACLP', 'Texas Instruments', 'adjustable shunt reference 2.495 V, TO-92', 0.3, 0.1, 'estimate', any('TO-92')) },
  dff: { any: e('CD4013BE', 'Texas Instruments', 'dual D flip-flop, CMOS 3–18 V, DIP-14', 0.45, 0.2, 'estimate', any('DIP-14')) },
  timer555: { NE555: e('NE555P', 'Texas Instruments', 'timer, DIP-8', 0.35, 0.12, 'estimate', any('DIP-8')) },
  opto: { PC817: e('PC817X1NSZ1B', 'Sharp', 'optocoupler, transistor output, DIP-4', 0.3, 0.1, 'estimate', any('DIP-4')) },
  lm317: { LM317HV: e('LM317HVT/NOPB', 'Texas Instruments', 'adjustable regulator, 60 V input–output, 1.5 A, TO-220', 2.2, 1.26, 'live', [{ distributor: 'Mouser', sku: '926-LM317HVT/NOPB' }, { distributor: 'RS', sku: '197-7244' }], 'on a heatsink of 8 K/W: Fischer SK 76 37,5 SA (RS 221-2176), about €3.50') },
  npn: {
    D44H11: e('D44H11G', 'onsemi', 'NPN 80 V 10 A switching, TO-220', 0.95, 0.45, 'estimate', any('TO-220')),
    BD139: e('BD139-16', 'STMicroelectronics', 'NPN 80 V 1.5 A, TO-126', 0.45, 0.2, 'estimate', any('TO-126')),
    BC547B: e('BC547B', 'onsemi', 'NPN 45 V 100 mA, TO-92', 0.1, 0.03, 'estimate', any('TO-92')),
    MJE340: e('MJE340G', 'onsemi', 'NPN 300 V 0.5 A, TO-126 (on the heatsink, insulated)', 0.84, 0.35, 'live', [{ distributor: 'Mouser', sku: '863-MJE340G' }, { distributor: 'LCSC', sku: 'C898406' }, { distributor: 'RS', sku: '046-4205' }]),
  },
  pnp: { BD140: e('BD140-16', 'STMicroelectronics', 'PNP 80 V 1.5 A, TO-126', 0.45, 0.2, 'estimate', any('TO-126')), D45H11: e('D45H11G', 'onsemi', 'PNP 80 V 10 A switching, TO-220', 0.95, 0.45, 'estimate', any('TO-220')) },
  led: {
    green: e('5 mm green LED, 20 mA', 'Kingbright (e.g. L-53GD)', 'LED 5 mm green, diffused', 0.12, 0.04, 'estimate', any('5 mm LED')),
    yellow: e('5 mm yellow LED, 20 mA', 'Kingbright (e.g. L-53YD)', 'LED 5 mm yellow, diffused', 0.12, 0.04, 'estimate', any('5 mm LED')),
    red: e('5 mm red LED, 20 mA', 'Kingbright (e.g. L-53ID)', 'LED 5 mm red, diffused', 0.12, 0.04, 'estimate', any('5 mm LED')),
  },
  ntc: { '10k': e('NTCLE100E3103JB0', 'Vishay', 'NTC thermistor 10 kΩ, B 3977 K, radial (heatsink sensor)', 0.47, 0.27, 'live', [{ distributor: 'Farnell', sku: '1434160' }, { distributor: 'LCSC', sku: 'C141588' }, { distributor: 'RS', sku: '754-6645' }]) },
  terminal: { '5.08 mm, 1 pole': e('MKDS 1,5/ 2-5,08 (2 poles per block)', 'Phoenix Contact', 'PCB screw terminal 5.08 mm (control and sensors, per pole); mains and battery wiring: DIN-rail terminals PT 10 / PT 16 N', 0.4, 0.25, 'estimate', [{ distributor: 'RS', sku: '193-0564' }], 'power terminals PT 10 BK (RS 207-2871) about €1.00 per pole') },
  inductor: { '56 µH': e('made to specification', 'magnetics supplier (Kool Mµ / powder-core toroid)', 'power inductor 56 µH at 100 A DC, 20 kHz, powder core, temperature class 155 °C', 105, 52, 'estimate', [{ distributor: 'magnetics supplier' }]) },
};

/** Transformers by turns ratio (their value). */
const TRANSFORMERS: Record<string, CatalogueEntry> = {
  '0.052': e('VB 1,0/1/12', 'Block', 'PCB transformer 230 V / 12 V, 1 VA (sense)', 7.2, 7.2, 'live', [{ distributor: 'RS', sku: '074-8411', url: 'https://es.rs-online.com/web/p/transformadores-de-pcb/0748411' }]),
  '8.36': e('made to specification', 'transformer winder (toroidal, e.g. Talema or local)', 'toroidal transformer 5 kVA, 50 Hz, 27.5 V / 230 V, leakage inductance for the PWM filter, class F, thermal cut-out in the winding', 480, 320, 'estimate', [{ distributor: 'transformer winder' }]),
  '0.13': e('FL 24/24 (or Hahn BV EI 482 series)', 'Block / Hahn', 'PCB transformer 230 V / 24 V, 25 VA, short-circuit proof (control supply)', 22, 16, 'estimate', [{ distributor: 'Bürklin / Reichelt' }]),
};

function capacitor(value: string, vmax: number, pol: boolean): CatalogueEntry {
  const c = parseValue(value) ?? 0;
  if (pol) {
    if (c >= 1e-3) return e(`${value}F ${vmax} V 105 °C low-ESR long life (series e.g. Nichicon UHW, Panasonic FC/FR)`, 'Nichicon / Panasonic', `electrolytic ${value}F ${vmax} V, 105 °C, 10 000 h, low ESR`, vmax > 63 ? 5.5 : 3.2, vmax > 63 ? 3.6 : 2.1, 'estimate', [{ distributor: 'Future Electronics / Mouser' }]);
    return e(`${value}F ${vmax} V 105 °C (e.g. Panasonic FC series)`, 'Panasonic / Nichicon', `electrolytic ${value}F ${vmax} V, 105 °C long life`, c >= 50e-6 ? 0.25 : 0.1, c >= 50e-6 ? 0.1 : 0.03, 'estimate', any('radial'));
  }
  if (vmax >= 600) return c >= 50e-9
    ? e('X2 film capacitor 275 V AC (e.g. TDK B32922C3104)', 'TDK / KEMET', `${value}F X2 275 V AC film (across mains contacts)`, 0.35, 0.15, 'estimate', any('X2'))
    : e('film capacitor 630 V DC (e.g. WIMA FKP2)', 'WIMA / KEMET', `${value}F 630 V film (snubber)`, 0.25, 0.1, 'estimate', any('film'));
  if (c >= 40e-6) return vmax >= 200
    ? e('DC-link film capacitor 47 µF 450 V (KEMET C4AE / Vishay MKP1848 series)', 'KEMET / Vishay', '47 µF film, ≥ 250 V DC (a 450 V part, larger)', 12, 7, 'estimate', any('film DC-link'))
    : e('DC-link film capacitor 47 µF 100 V (e.g. KEMET C4AQ / WIMA DC-LINK MKP4)', 'KEMET / WIMA', '47 µF film 100 V DC', 6, 3.5, 'estimate', any('film DC-link'));
  if (c >= 1e-6) return e(`MKT film ${value}F ${vmax} V (e.g. WIMA MKS4, TDK B32529)`, 'WIMA / TDK', `${value}F ${vmax} V polyester film`, c >= 4e-6 ? 0.8 : 0.35, c >= 4e-6 ? 0.4 : 0.18, 'estimate', any('film'));
  if (c >= 100e-9) return e(`ceramic X7R or MKT ${value}F ${vmax} V, 5.08 mm`, 'KEMET / Vishay', `${value}F ${vmax} V (X7R ceramic for decoupling, film for timing)`, 0.12, 0.04, 'estimate', any('5.08 mm'));
  return e(`C0G ceramic ${value}F ${vmax} V, 5.08 mm`, 'KEMET / Vishay', `${value}F ${vmax} V C0G ceramic`, 0.1, 0.03, 'estimate', any('5.08 mm'));
}

function resistor(value: string, pmax: number): CatalogueEntry {
  const r = parseValue(value) ?? 0;
  if (r > 0 && r < 0.5e-3) return e(`busbar shunt ${value}Ω, 10 W, 1 % (e.g. Isabellenhütte BVR series)`, 'Isabellenhütte', `shunt ${value}Ω, 10 W, 1 %, four-terminal`, 9, 6, 'estimate', [{ distributor: 'RS / Isabellenhütte' }]);
  if (r > 0 && r <= 0.01) return e('BVN-M-R001-1.0', 'Isabellenhütte', `shunt ${value}Ω, 10 W, 1 %`, 4, 2.5, 'estimate', [{ distributor: 'RS', sku: '193-0103' }]);
  if (pmax >= 1) return e(`metal film ${value}Ω 1 W, 1 % (e.g. Vishay PR01)`, 'Vishay / Yageo', `resistor ${value}Ω, ${pmax} W`, 0.12, 0.05, 'estimate', any('axial 1 W'));
  return e(`metal film ${value}Ω 0.6 W, 1 %, 50 ppm/K (e.g. Vishay MBB0207)`, 'Vishay / Yageo', `resistor ${value}Ω, 0207, 1 %`, 0.08, 0.02, 'estimate', any('0207 1 %'));
}

function fuse(value: string): CatalogueEntry {
  const a = parseValue(value) ?? 0;
  if (a >= 50) return e('JJN-100 + holder', 'Eaton Bussmann', 'Class T fuse 100 A, 160 V DC, with holder (battery: a 32 V automotive MEGA/MIDI fuse is not rated for a 58 V battery)', 30, 20, 'estimate', [{ distributor: 'electrical wholesale' }]);
  return e('0034.3109 + 0031.8201', 'Schurter', `fuse 5 × 20 mm T ${value} A with PCB holder`, 1.2, 0.8, 'estimate', [{ distributor: 'Bürklin (holder)', sku: '46G6020' }]);
}

const num = (details: string, label: string): number => {
  const m = new RegExp(`${label} ([\\d.]+) ?([kmµunM]?)`).exec(details);
  if (!m) return NaN;
  return parseValue(`${m[1]}${m[2]}`) ?? NaN;
};

/** Catalogue data for a parts-list line, or null when the line has none (a test part, a generic part). */
export function catalogueFor(line: BomLine): CatalogueEntry | null {
  const v = line.raw;
  switch (line.sym) {
    case 'resistor': return resistor(v, num(line.details, 'power rating') || 0.25);
    case 'capacitor': return capacitor(v, num(line.details, 'voltage rating') || 50, false);
    case 'capacitor_pol': return capacitor(v, num(line.details, 'voltage rating') || 25, true);
    case 'fuse': return fuse(v);
    case 'transformer': return TRANSFORMERS[v] ?? null;
    case 'breaker1': case 'breaker2': case 'breaker4': return BY_VALUE[line.sym]?.[line.value] ?? null;
    case 'inductor': return BY_VALUE.inductor[line.value.replace(/\s/g, ' ')] ?? BY_VALUE.inductor['56 µH'];
    case 'terminal': return BY_VALUE.terminal['5.08 mm, 1 pole'];
    case 'dff': return BY_VALUE.dff.any; // its value is the supply rail
    default: return BY_VALUE[line.sym]?.[v] ?? null;
  }
}

export interface CostedLine extends BomLine { cat: CatalogueEntry | null; unit: number | null; total: number | null }

/** The parts list with procurement data and the cost of one unit (prices at quantity 1, or at
 *  100 for a batch of `batch` ≥ 25 units). */
export function costedBom(lines: BomLine[], batch = 1): { lines: CostedLine[]; total: number; missing: number } {
  let total = 0, missing = 0;
  const out = lines.map((l) => {
    const cat = catalogueFor(l);
    const unit = cat ? (batch >= 25 && cat.price100 !== undefined ? cat.price100 : cat.price1) : null;
    const t = unit === null ? null : unit * l.qty;
    if (t === null) missing++; else total += t;
    return { ...l, cat, unit, total: t };
  });
  return { lines: out, total, missing };
}

const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** The costed parts list as CSV (spreadsheet), with the procurement columns. */
export function costedCsv(lines: CostedLine[]): string {
  const rows = [['Qty', 'References', 'Part', 'Value', 'Details', 'Manufacturer', 'Part number', 'Where to buy (order number)', 'Price basis', 'EUR each (qty 1)', 'EUR each (qty 100)', 'EUR total', 'Note'],
    ...lines.map((l) => [l.qty, l.refs.join(' '), l.part, l.value, l.details, l.cat?.maker ?? '', l.cat?.mpn ?? '', l.cat ? l.cat.offers.map((o) => (o.sku ? `${o.distributor} ${o.sku}` : o.distributor)).join('; ') : '',
      l.cat?.basis ?? '', l.cat ? l.cat.price1.toFixed(2) : '', l.cat?.price100 !== undefined ? l.cat.price100.toFixed(2) : '', l.total === null ? '' : l.total.toFixed(2), l.cat?.note ?? ''])];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
