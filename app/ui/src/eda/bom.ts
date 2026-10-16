// Bill of materials of a schematic: identical parts (same symbol, value and parameters) are
// one line with their quantity and references. Power symbols are not parts.

import { symbolOf } from './symbols';
import { PACKAGE_UNITS, packageRef, type Sheet } from './schematic';
import { formatValue, parseValue } from './units';
import { importModel } from './spicemodel';
import { pinOrder } from './connectivity';

export interface BomLine { qty: number; refs: string[]; part: string; value: string; details: string; standard: boolean; sym: string; raw: string }

/** Parts of a test bench (scope=test: sources, loads, the PV array, the battery) are not part of
 *  the product; `withTest` lists them too. */
export const isTestPart = (p: { props: Record<string, string> }) => p.props.scope === 'test';

export function buildBom(sheet: Sheet, withTest = false): BomLine[] {
  const lines = new Map<string, BomLine>();
  const seenPkg = new Set<string>();
  const terminals: string[] = [];
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power || (!withTest && isTestPart(p))) continue;
    // the units of a multi-unit IC are one part
    if (p.props.pkg) { const k = packageRef(p); if (seenPkg.has(k)) continue; seenPkg.add(k); }
    const raw = p.props[s.value.key] ?? s.value.default;
    // switches' states and positions are operating states, not part values
    const num = s.value.unit ? parseValue(raw) : null;
    let value = s.value.kind === 'bool' || s.interactive ? '' : num !== null && !raw.endsWith(s.value.unit!) ? formatValue(num, s.value.unit) : raw;
    // a terminal's value is its function (L in, PV+…): all terminals are one part, the functions listed
    if (p.sym === 'terminal') { terminals.push(raw); value = '5.08 mm, 1 pole'; }
    // a breaker's rating and curve are what is bought (its state is an operating state)
    if (p.sym.startsWith('breaker')) value = `${p.props.curve ?? 'C'}${p.props.value ?? ''} A`;
    const card = p.props.spice?.trim() ? importModel(p.sym, p.props.spice) : null;
    // ratings are always listed (what to buy); other parameters when they differ from the default
    const RATING = new Set(['vmax', 'pmax', 'imax']);
    const details = s.params
      .filter((d) => d.key !== 'spice' && d.key !== 'curve' && (RATING.has(d.key) || (p.props[d.key] ?? d.default) !== d.default))
      .map((d) => { const v = p.props[d.key] ?? d.default, n = d.unit ? parseValue(v) : null; return `${d.label.toLowerCase()} ${n !== null && d.unit && d.unit !== '%' && d.unit !== '°' ? formatValue(n, d.unit) : `${v}${d.unit ?? ''}`}`; })
      .join('; ');
    if (card && !('error' in card)) value = `${card.name} (SPICE model)`;
    const key = `${p.sym}|${value}|${details}`;
    const l = lines.get(key);
    const ref = packageRef(p);
    const part = p.props.pkg && PACKAGE_UNITS[raw] ? `${s.name} (${PACKAGE_UNITS[raw]} in one package)` : s.name;
    if (l) { l.qty++; l.refs.push(ref); } else lines.set(key, { qty: 1, refs: [ref], part, value, details, standard: false, sym: p.sym, raw });
  }
  const out = [...lines.values()];
  const t = out.find((l) => l.part === symbolOf('terminal').name);
  if (t) t.details = `functions: ${terminals.join(', ')}`;
  for (const l of out) l.refs.sort(pinOrder);
  return out.sort((a, b) => pinOrder(a.refs[0], b.refs[0]));
}

const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function bomCsv(lines: BomLine[]): string {
  const rows = [['Qty', 'References', 'Part', 'Value', 'Details', 'Catalogue part'], ...lines.map((l) => [l.qty, l.refs.join(' '), l.part, l.value, l.details, l.standard ? 'yes' : 'no (generic library)'])];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
