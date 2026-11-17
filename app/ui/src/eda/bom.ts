// Bill of materials of a schematic: identical parts (same symbol, value and parameters) are
// one line with their quantity and references. Power symbols are not parts.

import { symbolOf } from './symbols';
import { packageRef, unitsPerPackage, type Sheet } from './schematic';
import { formatValue, parseValue } from './units';
import { importModel } from './spicemodel';
import { pinOrder } from './connectivity';

export interface BomLine { qty: number; refs: string[]; part: string; value: string; details: string; standard: boolean; sym: string; raw: string }

/** Parts of a test bench (scope=test: sources, loads, the PV array, the battery) are not part of
 *  the product; `withTest` lists them too. */
/** What a terminal is bought as: a PCB screw terminal, or a DIN-rail block for its conductor. */
export const terminalKind = (props: Record<string, string>) =>
  props.wire ? `DIN rail, ${props.wire} mm²${props.io === 'pe' ? ', PE' : ''}` : '5.08 mm, 1 pole';
export const isTestPart = (p: { props: Record<string, string> }) => p.props.scope === 'test';

export function buildBom(sheet: Sheet, withTest = false): BomLine[] {
  const lines = new Map<string, BomLine>();
  const seenPkg = new Set<string>();
  const terminals = new Map<string, string[]>();
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power || (!withTest && isTestPart(p))) continue;
    const raw = p.props[s.value.key] ?? s.value.default;
    // the units of a multi-unit part are one part: identified by their package and type, so a
    // product whose units are of different symbols (an SPD's varistor and spark gaps) is one too
    if (p.props.pkg) { const k = `${p.props.pkg}|${raw}`; if (seenPkg.has(k)) continue; seenPkg.add(k); }
    // switches' states and positions are operating states, not part values
    const num = s.value.unit ? parseValue(raw) : null;
    let value = s.value.kind === 'bool' || s.interactive ? '' : num !== null && !raw.endsWith(s.value.unit!) ? formatValue(num, s.value.unit) : raw;
    // a terminal's value is its function (L in, PV+…): the terminals of one kind are one part,
    // their functions listed. The kind: a PCB terminal, or (`wire`: the conductor in mm²) a
    // DIN-rail terminal block for that conductor, green-yellow for PE
    if (p.sym === 'terminal') { value = terminalKind(p.props); terminals.set(value, [...(terminals.get(value) ?? []), `${p.ref} ${raw}`]); }
    // a panel fuse (`din`): a gG cartridge in a DIN-rail holder, not a PCB fuse
    if (p.sym === 'fuse' && p.props.din) value = `gG ${raw} A, 10×38, DIN-rail holder`;
    if (p.sym === 'fuse' && p.props.fusetype === 'aR') value = `aR ${raw} A, square body, fuse base`;
    if (p.sym === 'fuse' && p.props.fusetype === 'H') value = `T ${raw} A H, 5×20 ceramic`;
    // a breaker's rating and curve are what is bought (its state is an operating state)
    if (p.sym.startsWith('breaker')) value = `${p.props.curve ?? 'C'}${p.props.value ?? ''} A`;
    // a contactor with a front-mounted auxiliary block (aux2: 43-44 NO, 31-32 NC) is bought with it
    if (p.sym === 'contactor' && p.props.aux2 === 'true') value = `${raw}, + aux block 1 NO + 1 NC`;
    // a button on the board is a tactile switch; one with panel: 'true' a 22 mm door button
    if (p.sym === 'button') value = p.props.panel === 'true' ? '22 mm, 1 NO' : 'tactile 6 mm';
    const card = p.props.spice?.trim() ? importModel(p.sym, p.props.spice) : null;
    // ratings are always listed (what to buy); other parameters when they differ from the default
    const RATING = new Set(['vmax', 'pmax', 'imax']);
    const details = s.params
      .filter((d) => d.key !== 'spice' && d.key !== 'curve' && d.key !== 'tj' && (RATING.has(d.key) || (p.props[d.key] ?? d.default) !== d.default))
      .map((d) => { const v = p.props[d.key] ?? d.default, n = d.unit ? parseValue(v) : null; return `${d.label.toLowerCase()} ${n !== null && d.unit && d.unit !== '%' && d.unit !== '°' ? formatValue(n, d.unit) : `${v}${d.unit ?? ''}`}`; })
      .join('; ');
    if (card && !('error' in card)) value = `${card.name} (SPICE model)`;
    const key = `${p.sym}|${value}|${details}`;
    const l = lines.get(key);
    const ref = packageRef(p);
    const units = p.props.pkg ? unitsPerPackage(p.sym, raw) : undefined;
    const part = units ? `${s.name} (${units} in one package)` : s.name;
    if (l) { l.qty++; l.refs.push(ref); } else lines.set(key, { qty: 1, refs: [ref], part, value, details, standard: false, sym: p.sym, raw });
  }
  const out = [...lines.values()];
  // each terminal's function next to its reference, in reference order
  for (const t of out.filter((l) => l.part === symbolOf('terminal').name)) t.details = `functions: ${(terminals.get(t.value) ?? []).sort((a, b) => pinOrder(a.split(' ')[0], b.split(' ')[0])).join(', ')}`;
  for (const l of out) l.refs.sort(pinOrder);
  return out.sort((a, b) => pinOrder(a.refs[0], b.refs[0]));
}

const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function bomCsv(lines: BomLine[]): string {
  const rows = [['Qty', 'References', 'Part', 'Value', 'Details', 'Catalogue part'], ...lines.map((l) => [l.qty, l.refs.join(' '), l.part, l.value, l.details, l.standard ? 'yes' : 'no (generic library)'])];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
