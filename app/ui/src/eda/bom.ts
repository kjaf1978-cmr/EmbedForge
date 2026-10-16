// Bill of materials of a schematic: identical parts (same symbol, value and parameters) are
// one line with their quantity and references. Power symbols are not parts.

import { symbolOf } from './symbols';
import { PACKAGE_UNITS, packageRef, type Sheet } from './schematic';
import { parseValue } from './units';
import { importModel } from './spicemodel';
import { pinOrder } from './connectivity';

export interface BomLine { qty: number; refs: string[]; part: string; value: string; details: string; standard: boolean }

export function buildBom(sheet: Sheet): BomLine[] {
  const lines = new Map<string, BomLine>();
  const seenPkg = new Set<string>();
  for (const p of sheet.parts) {
    const s = symbolOf(p.sym);
    if (s.power) continue;
    // the units of a multi-unit IC are one part
    if (p.props.pkg) { const k = packageRef(p); if (seenPkg.has(k)) continue; seenPkg.add(k); }
    const raw = p.props[s.value.key] ?? s.value.default;
    // switches' states and positions are operating states, not part values
    let value = s.value.kind === 'bool' || s.interactive ? '' : s.value.unit && parseValue(raw) !== null && !raw.endsWith(s.value.unit) ? `${raw} ${s.value.unit}` : raw;
    const card = p.props.spice?.trim() ? importModel(p.sym, p.props.spice) : null;
    const details = s.params
      .filter((d) => (p.props[d.key] ?? d.default) !== d.default && d.key !== 'spice')
      .map((d) => `${d.label.toLowerCase()} ${p.props[d.key]}${d.unit && d.unit !== '%' && d.unit !== '°' ? ` ${d.unit}` : d.unit ?? ''}`)
      .join('; ');
    if (card && !('error' in card)) value = `${card.name} (SPICE model)`;
    const key = `${p.sym}|${value}|${details}`;
    const l = lines.get(key);
    const ref = packageRef(p);
    const part = p.props.pkg && PACKAGE_UNITS[raw] ? `${s.name} (${PACKAGE_UNITS[raw]} in one package)` : s.name;
    if (l) { l.qty++; l.refs.push(ref); } else lines.set(key, { qty: 1, refs: [ref], part, value, details, standard: false });
  }
  const out = [...lines.values()];
  for (const l of out) l.refs.sort(pinOrder);
  return out.sort((a, b) => pinOrder(a.refs[0], b.refs[0]));
}

const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function bomCsv(lines: BomLine[]): string {
  const rows = [['Qty', 'References', 'Part', 'Value', 'Details', 'Catalogue part'], ...lines.map((l) => [l.qty, l.refs.join(' '), l.part, l.value, l.details, l.standard ? 'yes' : 'no (generic library)'])];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
