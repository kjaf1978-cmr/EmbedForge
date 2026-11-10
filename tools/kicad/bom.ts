// The board's parts list with procurement data (D29), as written next to each board (bom.csv):
// the lines on this board first, then those off it (panel, chassis, the other board), each with
// the footprint it has here
import type { Sheet } from '../../app/ui/src/eda/schematic';
import type { boardNetlist } from '../../app/ui/src/pcb/kicad';
import { buildBom } from '../../app/ui/src/eda/bom';
import { costedBom, PRICE_NOTE } from '../../app/ui/src/eda/catalogue';

export function bomCsv(sheet: Sheet, nl: ReturnType<typeof boardNetlist>): string {
  const onBoard = new Map(nl.parts.map((p) => [p.ref, p.footprint.id]));
  const where = (refs: string[]) => { for (const r of refs) { const k = onBoard.get(r) ?? onBoard.get(r.replace(/[A-Z]$/, '')); if (k) return k; } return ''; };
  const costed = costedBom(buildBom(sheet)).lines.map((l) => ({ l, fp: where(l.refs) })).sort((a, b) => (a.fp ? 0 : 1) - (b.fp ? 0 : 1));
  const cell = (x: string | number | null | undefined) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const rows = [['on this board', 'qty', 'references', 'part', 'value', 'details', 'footprint', 'MPN', 'maker', 'distributors (order numbers)', 'unit EUR', 'total EUR', 'price basis'].map(cell).join(',')];
  for (const { l, fp } of costed) rows.push([fp ? 'yes' : 'no', l.qty, l.refs.join(' '), l.part, l.value, l.details, fp, l.cat?.mpn, l.cat?.maker, l.cat?.offers.map((o) => `${o.distributor}${o.sku ? ` ${o.sku}` : ''}`).join('; '), l.unit?.toFixed(2), l.total?.toFixed(2), l.cat?.basis].map(cell).join(','));
  const boardTotal = costed.filter((x) => x.fp).reduce((a, x) => a + (x.l.total ?? 0), 0);
  rows.push('', cell(`Parts on this board: EUR ${boardTotal.toFixed(2)} (unit quantity). ${PRICE_NOTE}`));
  return rows.join('\n') + '\n';
}
