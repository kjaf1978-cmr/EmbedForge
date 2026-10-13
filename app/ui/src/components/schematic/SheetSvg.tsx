// Renders a schematic sheet as SVG elements (the live canvas and the SVG/PNG export use it).

import type { JSX } from 'preact';
import { symbolOf, type Gfx, type Pt } from '../../eda/symbols';
import { pinPositions, valueText, type Part, type Sheet } from '../../eda/schematic';
import { labelPos } from '../../eda/editor';
import type { Connectivity } from '../../eda/connectivity';
import type { ErcIssue } from '../../eda/erc';
import { formatValue } from '../../eda/units';

export function fillOf(f: string | undefined): string {
  if (!f || f === 'none') return 'none';
  if (f === 'fg') return 'var(--sch-part)';
  if (f === 'bg') return 'var(--sch-fill)';
  return f;
}

export function GfxEl({ g }: { g: Gfx }): JSX.Element {
  if (g.t === 'path') return <path d={g.d} fill={fillOf(g.fill)} stroke-width={g.w ?? 1.5} class="sym" />;
  if (g.t === 'circle') return <circle cx={g.cx} cy={g.cy} r={g.r} fill={fillOf(g.fill)} class="sym" />;
  return <text x={g.x} y={g.y} font-size={g.size ?? 9} text-anchor="middle" class="sym-text">{g.s}</text>;
}

export function partTransform(p: Pick<Part, 'x' | 'y' | 'rot' | 'mirror'>): string {
  return `translate(${p.x} ${p.y}) rotate(${p.rot * 90}) scale(${p.mirror ? -1 : 1} 1)`;
}

export interface SheetView {
  conn: Connectivity;
  selected?: { parts: Set<string>; wires: Set<string>; labels: Set<string> };
  highlightNet?: string | null;
  /** Operating-point results to show on the schematic. */
  op?: { v: Record<string, number>; i: Record<string, number> } | null;
  showValues?: boolean;
  erc?: ErcIssue[];
  /** LED brightness 0..1 by part id. */
  glow?: Map<string, number>;
  probeLabels?: Map<string, string>;
}

/** Position for a net's voltage chip: the middle of its longest wire, else its first pin. */
function netAnchor(sheet: Sheet, conn: Connectivity, net: string): Pt | null {
  const n = conn.nets.find((x) => x.name === net);
  if (!n) return null;
  let best: { a: Pt; b: Pt; l: number } | null = null;
  for (const id of n.wires) {
    const w = sheet.wires.find((x) => x.id === id);
    if (!w) continue;
    const l = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (!best || l > best.l) best = { a: w.a, b: w.b, l };
  }
  if (best) return { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
  return null;
}

export function SheetContent({ sheet, view }: { sheet: Sheet; view: SheetView }) {
  const { conn, selected, highlightNet, op, showValues, erc, glow, probeLabels } = view;
  const connected = new Set([...conn.pinNet.keys()]);
  const hlWires = new Set(highlightNet ? conn.nets.find((n) => n.name === highlightNet)?.wires ?? [] : []);
  return (
    <g>
      {/* net highlight underlay (UI-08 (h)) */}
      {sheet.wires.filter((w) => hlWires.has(w.id)).map((w) => <line key={`h${w.id}`} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} class="net-hl no-export" />)}
      {sheet.wires.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} class={`wire${selected?.wires.has(w.id) ? ' is-sel' : ''}`} data-wire={w.id} />
      ))}
      {conn.junctions.map((j) => <circle key={`j${j.x},${j.y}`} cx={j.x} cy={j.y} r={3} class="junction" />)}
      {sheet.parts.map((p) => {
        const s = symbolOf(p.sym);
        const sel = selected?.parts.has(p.id);
        const g = glow?.get(p.id) ?? 0;
        const ref = labelPos(p, 'ref'), val = labelPos(p, 'val');
        const vt = valueText(p);
        return (
          <g key={p.id} class={`part${sel ? ' is-sel' : ''}`} data-part={p.id}>
            {g > 0.01 && <circle cx={p.x} cy={p.y} r={10 + 14 * g} class="led-glow no-export" style={{ opacity: Math.min(0.9, 0.25 + g * 0.65), fill: ledCss(p) }} />}
            <g transform={partTransform(p)}>
              {s.gfx(p.props).map((x, i) => <GfxEl key={i} g={x} />)}
            </g>
            {pinPositions(p).map((pp) => (!s.power && !connected.has(`${p.ref}.${pp.pin}`) ? <circle key={pp.pin} cx={pp.at.x} cy={pp.at.y} r={2} class="pin-open" /> : null))}
            {!s.power && <text x={ref.at.x} y={ref.at.y} text-anchor={ref.anchor} class="ref">{p.ref}</text>}
            {vt && <text x={val.at.x} y={val.at.y} text-anchor={val.anchor} class={s.power ? 'pwr-name' : 'val'}>{vt}</text>}
          </g>
        );
      })}
      {sheet.labels.map((l) => (l.note ? (
        <g key={l.id} class={`note${selected?.labels.has(l.id) ? ' is-sel' : ''}`} data-label={l.id}>
          <text x={l.x} y={l.y - 2} class="note-text">{l.name}</text>
        </g>
      ) : (
        <g key={l.id} class={`label${selected?.labels.has(l.id) ? ' is-sel' : ''}`} data-label={l.id}>
          <rect x={l.x - 1.5} y={l.y - 1.5} width={3} height={3} class="label-dot" />
          <text x={l.x + 3} y={l.y - 4} class="label-text">{l.name}</text>
        </g>
      )))}
      {showValues && op && conn.nets.map((n) => {
        if (n.name === 'GND') return null;
        const v = op.v[n.name];
        const at = netAnchor(sheet, conn, n.name);
        if (v === undefined || !at) return null;
        const t = formatValue(v, 'V');
        return (
          <g key={`v${n.name}`} class="op-chip no-export-optional">
            <rect x={at.x - t.length * 2.9 - 3} y={at.y - 18} width={t.length * 5.8 + 6} height={11} rx={3} />
            <text x={at.x} y={at.y - 10} text-anchor="middle">{t}</text>
          </g>
        );
      })}
      {sheet.probes.map((pr) => {
        const label = probeLabels?.get(pr.id) ?? '';
        if (pr.kind === 'i') {
          const part = sheet.parts.find((p) => p.id === pr.part);
          const at = part ? pinPositions(part).find((pp) => pp.pin === pr.pin)?.at : null;
          if (!at) return null;
          return (
            <g key={pr.id} class="probe no-export" data-probe={pr.id}>
              <circle cx={at.x} cy={at.y} r={6} fill="none" stroke={pr.colour} stroke-width={2} />
              <text x={at.x + 8} y={at.y + 14} fill={pr.colour} class="probe-text">{label}</text>
            </g>
          );
        }
        const pts = pr.kind === 'vd' ? [pr.at, pr.at2] : [pr.at];
        return (
          <g key={pr.id} class="probe no-export" data-probe={pr.id}>
            {pts.map((a, k) => <path key={k} d={`M ${a.x} ${a.y} l 6 -12 h 6 l -6 12 z`} fill={pr.colour} />)}
            <text x={pts[0].x + 14} y={pts[0].y - 12} fill={pr.colour} class="probe-text">{label}</text>
          </g>
        );
      })}
      {erc?.filter((i) => i.at && i.severity !== 'info').map((i) => (
        <g key={i.id} class={`erc-marker ${i.severity} no-export`}>
          <title>{i.message}</title>
          <circle cx={i.at!.x} cy={i.at!.y} r={7} />
          <text x={i.at!.x} y={i.at!.y + 4} text-anchor="middle">!</text>
        </g>
      ))}
    </g>
  );
}

function ledCss(p: Part): string {
  const c = p.props.colour;
  return c === 'green' ? '#22d43a' : c === 'yellow' ? '#ffd400' : c === 'blue' ? '#2a7bff' : c === 'white' ? '#ffffff' : '#ff2a2a';
}
