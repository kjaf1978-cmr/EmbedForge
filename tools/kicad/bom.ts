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
  // a line whose parts sit partly on this board and partly elsewhere (the other board, the
  // panel) becomes two lines: the quantity on this board and the rest
  const split = costedBom(buildBom(sheet)).lines.flatMap((l) => {
    const on = l.refs.filter((r) => where([r])), off = l.refs.filter((r) => !where([r]));
    const part = (refs: string[]) => ({ ...l, refs, qty: refs.length, total: l.unit !== undefined && l.unit !== null ? l.unit * refs.length : l.total });
    return on.length && off.length ? [part(on), part(off)] : [l];
  });
  const costed = split.map((l) => ({ l, fp: where(l.refs) })).sort((a, b) => (a.fp ? 0 : 1) - (b.fp ? 0 : 1));
  const cell = (x: string | number | null | undefined) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const rows = [['on this board', 'qty', 'references', 'part', 'value', 'details', 'footprint', 'MPN', 'maker', 'distributors (order numbers)', 'unit EUR', 'total EUR', 'price basis'].map(cell).join(',')];
  const offers = (o?: { distributor: string; sku?: string }[]) => (o ?? []).map((x) => `${x.distributor}${x.sku ? ` ${x.sku}` : ''}`).join('; ');
  let boardTotal = 0;
  const extra: string[] = [];
  for (const { l, fp } of costed) {
    // a part mounted off the board whose wires land on a terminal block here (a DIN-rail breaker,
    // the autotransformer): the part is bought for the panel or chassis, the block for the board
    const landing = fp.startsWith('TerminalBlock_') && l.sym !== 'terminal';
    if (landing) {
      rows.push(['no: wired to its terminal block on the board', l.qty, l.refs.join(' '), l.part, l.value, l.details, '', l.cat?.mpn, l.cat?.maker, offers(l.cat?.offers), l.unit?.toFixed(2), l.total?.toFixed(2), l.cat?.basis].map(cell).join(','));
      const poles = Number(/1x(\d+)/.exec(fp)?.[1] ?? 2), pitch = /P([\d.]+)/.exec(fp)?.[1] ?? '5.08', unit = 0.6 * poles;
      boardTotal += unit * l.qty;
      extra.push(['yes', l.qty, l.refs.map((r) => `${r} (landing)`).join(' '), 'Screw terminal block for an off-board part', `${poles} poles, ${pitch} mm`, `the wires of ${l.refs.join(' ')} (${l.part}) land here`, fp, `PCB screw terminal block ${poles}-pole, ${pitch} mm pitch, 2.5 mm², ≥ 10 A, 400 V`, 'Phoenix Contact / Würth', 'any distributor', unit.toFixed(2), (unit * l.qty).toFixed(2), 'estimate'].map(cell).join(','));
      continue;
    }
    // a terminal on a 7.62 mm footprint (mains creepage) is a 7.62 mm block, not the 5.08 mm one
    if (l.sym === 'terminal' && fp.includes('P7.62')) {
      const unit = 0.6;
      boardTotal += unit * l.qty;
      rows.push(['yes', l.qty, l.refs.join(' '), l.part, `${l.qty} poles, 7.62 mm`, l.details, fp, 'PCB screw terminal block 7.62 mm pitch, 2.5 mm², ≥ 10 A, 400 V (blocks of 2 or 3 poles)', 'Phoenix Contact / Würth', 'any distributor', unit.toFixed(2), (unit * l.qty).toFixed(2), 'estimate'].map(cell).join(','));
      continue;
    }
    if (fp) boardTotal += l.total ?? 0;
    rows.push([fp ? 'yes' : 'no', l.qty, l.refs.join(' '), l.part, l.value, l.details, fp, l.cat?.mpn, l.cat?.maker, offers(l.cat?.offers), l.unit?.toFixed(2), l.total?.toFixed(2), l.cat?.basis].map(cell).join(','));
  }
  rows.splice(1, 0, ...extra);
  rows.push('', cell(`Parts on this board: EUR ${boardTotal.toFixed(2)} (unit quantity). ${PRICE_NOTE}`));
  return rows.join('\n') + '\n';
}
