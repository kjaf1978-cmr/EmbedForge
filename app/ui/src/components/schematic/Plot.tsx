// Waveform viewer (SIM-02): traces grouped by unit in stacked plots, two cursors, drag to zoom,
// measurements over the visible range, CSV export.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatValue } from '../../eda/units';
import { interpAt, logTicks, measure, niceTicks, timing } from '../../sim/measure';
import { spectrum, thd } from '../../sim/fft';

export interface Trace { id: string; name: string; colour: string; unit: string; y: number[]; dashed?: boolean }

interface Props {
  x: number[];
  xLabel: string;
  xUnit: string;
  log?: boolean;
  traces: Trace[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
  onExportCsv?: () => void;
  height?: number;
}

const ML = 64, MR = 16, MT = 10, MB = 24;
let plotSeq = 0;

export function Plot({ x, xLabel, xUnit, log, traces, selected, onSelect, onRemove, onExportCsv, height }: Props) {
  const H = height ?? 170;
  const box = useRef<HTMLDivElement>(null);
  const uid = useMemo(() => ++plotSeq, []);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const full: [number, number] = [x[0] ?? 0, x[x.length - 1] ?? 1];
  const [range, setRange] = useState<[number, number]>(full);
  const [cur, setCur] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  // reset the view when a new result arrives with a different x span
  const sig = `${full[0]}:${full[1]}:${x.length}`;
  const lastSig = useRef(sig);
  useEffect(() => {
    if (lastSig.current !== sig) {
      const sameSpan = lastSig.current.split(':').slice(0, 2).join(':') === `${full[0]}:${full[1]}`;
      lastSig.current = sig;
      if (!sameSpan) { setRange(full); setCur({ a: null, b: null }); }
    }
  }, [sig]);

  const groups = useMemo(() => {
    const m = new Map<string, Trace[]>();
    for (const t of traces) m.set(t.unit, [...(m.get(t.unit) ?? []), t]);
    return [...m.entries()];
  }, [traces]);

  const pw = w - ML - MR;
  const [r0, r1] = range;
  const fx = (v: number) => (log ? ML + ((Math.log10(v) - Math.log10(r0)) / (Math.log10(r1) - Math.log10(r0) || 1)) * pw : ML + ((v - r0) / (r1 - r0 || 1)) * pw);
  const inv = (px: number) => {
    const t = Math.min(1, Math.max(0, (px - ML) / pw));
    return log ? Math.pow(10, Math.log10(r0) + t * (Math.log10(r1) - Math.log10(r0))) : r0 + t * (r1 - r0);
  };
  const xticks = log ? logTicks(r0, r1) : niceTicks(r0, r1, Math.max(3, Math.floor(pw / 90)));

  const onDown = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ x0: px, x1: px });
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    setDrag({ ...drag, x1: e.clientX - rect.left });
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const a = inv(Math.min(drag.x0, drag.x1)), b = inv(Math.max(drag.x0, drag.x1));
    if (Math.abs(drag.x1 - drag.x0) > 6) setRange([a, b]);
    else {
      const v = inv(drag.x0);
      setCur((c) => (e.shiftKey ? { ...c, b: v } : { ...c, a: v }));
    }
    setDrag(null);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const c = inv(e.clientX - rect.left), k = e.deltaY > 0 ? 1.25 : 0.8;
    if (log) {
      const lc = Math.log10(c);
      setRange([Math.max(full[0], Math.pow(10, lc - (lc - Math.log10(r0)) * k)), Math.min(full[1], Math.pow(10, lc + (Math.log10(r1) - lc) * k))]);
    } else setRange([Math.max(full[0], c - (c - r0) * k), Math.min(full[1], c + (r1 - c) * k)]);
  };

  // visible indices, decimated to about 2 points per pixel
  const idx = useMemo(() => {
    const out: number[] = [];
    let i0 = x.findIndex((v) => v >= r0);
    if (i0 < 0) i0 = x.length - 1;
    i0 = Math.max(0, i0 - 1);
    let i1 = x.length - 1;
    for (let i = i0; i < x.length; i++) if (x[i] > r1) { i1 = i; break; }
    const step = Math.max(1, Math.floor((i1 - i0) / (pw * 2)));
    for (let i = i0; i <= i1; i += step) out.push(i);
    if (out[out.length - 1] !== i1) out.push(i1);
    return out;
  }, [x, r0, r1, pw]);

  const readout = (t: Trace, at: number | null) => (at === null ? '—' : formatValue(interpAt(x, t.y, at), t.unit));

  // FFT view of a transient over the visible range
  const canFft = !log && xUnit === 's' && x.length > 8;
  const [showFft, setShowFft] = useState(false);
  const [showTiming, setShowTiming] = useState(false);
  const pct = (v: number | null) => (v === null ? '—' : `${v < 0.05 ? '0' : v.toFixed(1)} %`);
  const time = (v: number | null) => (v === null ? '—' : formatValue(v, 's'));
  const fftData = useMemo(() => {
    if (!showFft || !canFft) return null;
    const specs = traces.filter((t) => t.unit === 'V' || t.unit === 'A').map((t) => ({ t, s: spectrum(x, t.y, r0, r1) }));
    if (!specs.length || !specs[0].s.f.length) return null;
    return {
      f: specs[0].s.f,
      traces: specs.map(({ t, s }) => ({ id: `fft:${t.id}`, name: `FFT ${t.name}`, colour: t.colour, unit: `dB${t.unit}`, dashed: t.dashed, y: s.amp.map((a) => 20 * Math.log10(a || 1e-30)) })),
      thd: specs.map(({ t, s }) => ({ name: t.name, unit: t.unit, r: thd(s) })),
      df: specs[0].s.df, fmax: specs[0].s.fmax, averaged: specs[0].s.averaged,
    };
  }, [showFft, canFft, traces, x, r0, r1]);

  return (
    <div class="plot" ref={box}>
      <div class="plot-bar row">
        <span class="small muted">{xLabel}: drag to zoom · click for cursor A, Shift+click for B · wheel zooms</span>
        <button onClick={() => { setRange(full); }}>Zoom to fit</button>
        <button onClick={() => setCur({ a: null, b: null })} disabled={cur.a === null && cur.b === null}>Clear cursors</button>
        {onExportCsv && <button onClick={onExportCsv}>Export CSV</button>}
        {canFft && <button aria-pressed={showFft} title="Spectrum of the visible range (Hann window)" onClick={() => setShowFft((v) => !v)}>FFT</button>}
        {canFft && <button aria-pressed={showTiming} title="Rise and fall time, period, duty cycle and overshoot of the visible range" onClick={() => setShowTiming((v) => !v)}>Pulse</button>}
      </div>
      {groups.map(([unit, ts], gi) => {
        let lo = Infinity, hi = -Infinity;
        for (const t of ts) for (const i of idx) { const v = t.y[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
        if (!Number.isFinite(lo)) { lo = -1; hi = 1; }
        if (hi - lo < 1e-12) { const m = Math.max(Math.abs(hi), 1e-9) * 0.1; lo -= m; hi += m; }
        const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
        const fy = (v: number) => MT + (1 - (v - lo) / (hi - lo)) * (H - MT - MB);
        const yt = niceTicks(lo, hi, 5);
        return (
          <svg key={unit} class="plot-svg" width={w} height={H} role="img" aria-label={`${unit} plot of ${ts.map((t) => t.name).join(', ')}`}
               onPointerDown={onDown as never} onPointerMove={onMove as never} onPointerUp={onUp as never} onWheel={onWheel as never}>
            <rect x={ML} y={MT} width={pw} height={H - MT - MB} class="plot-bg" />
            {xticks.map((v) => <line key={`x${v}`} x1={fx(v)} x2={fx(v)} y1={MT} y2={H - MB} class="plot-grid" />)}
            {yt.map((v) => <line key={`y${v}`} x1={ML} x2={ML + pw} y1={fy(v)} y2={fy(v)} class="plot-grid" />)}
            {yt.map((v) => <text key={`yl${v}`} x={ML - 4} y={fy(v) + 4} class="plot-tick" text-anchor="end">{formatValue(v, unit, 3)}</text>)}
            {xticks.map((v) => <text key={`xl${v}`} x={fx(v)} y={H - 8} class="plot-tick" text-anchor="middle">{formatValue(v, xUnit, 3)}</text>)}
            <clipPath id={`plotclip-${uid}-${gi}`}><rect x={ML} y={MT} width={pw} height={H - MT - MB} /></clipPath>
            <g clip-path={`url(#plotclip-${uid}-${gi})`}>
              {ts.map((t) => (
                <polyline key={t.id} fill="none" stroke={t.colour} stroke-width={selected === t.id ? 3 : 1.6} stroke-dasharray={t.dashed ? '6 4' : undefined}
                          points={idx.map((i) => `${fx(x[i]).toFixed(1)},${fy(t.y[i]).toFixed(1)}`).join(' ')} />
              ))}
            </g>
            {cur.a !== null && <line x1={fx(cur.a)} x2={fx(cur.a)} y1={MT} y2={H - MB} class="plot-cur" />}
            {cur.b !== null && <line x1={fx(cur.b)} x2={fx(cur.b)} y1={MT} y2={H - MB} class="plot-cur b" />}
            {drag && Math.abs(drag.x1 - drag.x0) > 6 && <rect x={Math.min(drag.x0, drag.x1)} y={MT} width={Math.abs(drag.x1 - drag.x0)} height={H - MT - MB} class="plot-zoom" />}
          </svg>
        );
      })}
      <div class="table-wrap">
        <table class="plot-table">
          <thead><tr><th>Trace</th><th>at A</th><th>at B</th><th>B − A</th><th>Min</th><th>Max</th><th>Average</th><th>RMS</th><th>Peak-to-peak</th><th>Frequency</th><th /></tr></thead>
          <tbody>
            {traces.map((t) => {
              const m = measure(x, t.y, r0, r1);
              const d = cur.a !== null && cur.b !== null ? formatValue(interpAt(x, t.y, cur.b) - interpAt(x, t.y, cur.a), t.unit) : '—';
              return (
                <tr key={t.id} class={selected === t.id ? 'is-selected' : ''}>
                  <td><button class="link" onClick={() => onSelect?.(t.id)}><span class="swatch" style={{ background: t.colour }} />{t.name}</button></td>
                  <td>{readout(t, cur.a)}</td><td>{readout(t, cur.b)}</td><td>{d}</td>
                  <td>{formatValue(m.min, t.unit)}</td><td>{formatValue(m.max, t.unit)}</td><td>{formatValue(m.avg, t.unit)}</td>
                  <td>{formatValue(m.rms, t.unit)}</td><td>{formatValue(m.pp, t.unit)}</td><td>{m.freq ? formatValue(m.freq, 'Hz') : '—'}</td>
                  <td>{onRemove && <button aria-label={`Remove ${t.name}`} title="Remove probe" onClick={() => onRemove(t.id)}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showTiming && canFft && (
        <section class="timing" aria-label="Pulse measurements">
          <div class="table-wrap">
            <table class="plot-table">
              <caption class="small">Pulse measurements of {formatValue(r0, 's')} to {formatValue(r1, 's')}: edges from 10 % to 90 % of base to top, period and duty cycle at 50 %, averaged over the complete edges and cycles in view</caption>
              <thead><tr><th>Trace</th><th>Base</th><th>Top</th><th>Rise 10–90 %</th><th>Fall 90–10 %</th><th>Period</th><th>Duty cycle</th><th>Overshoot</th><th>Undershoot</th></tr></thead>
              <tbody>
                {traces.map((t) => {
                  const m = timing(x, t.y, r0, r1);
                  if (!m) return <tr key={t.id}><td>{t.name}</td><td colSpan={8} class="muted">flat: no pulse</td></tr>;
                  return (
                    <tr key={t.id}>
                      <td>{t.name}</td><td>{formatValue(m.base, t.unit)}</td><td>{formatValue(m.top, t.unit)}</td>
                      <td>{time(m.rise)}</td><td>{time(m.fall)}</td><td>{time(m.period)}</td><td>{pct(m.duty)}</td>
                      <td>{pct(m.overshoot)}</td><td>{pct(m.undershoot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {fftData && (
        <section class="fft" aria-label="Spectrum">
          <h4 class="small">Spectrum of {formatValue(r0, 's')} to {formatValue(r1, 's')} (Hann window; amplitudes are peak values, 0 dBV = 1 V)</h4>
          <p class="small muted">Resolution {formatValue(fftData.df, 'Hz')} (zoom out for finer), up to {formatValue(fftData.fmax, 'Hz')}{fftData.averaged ? '; the waveform has finer detail than the FFT holds, so each sample averages its interval (no aliasing; zoom in for higher frequencies)' : ''}. Amplitudes and frequencies of tones between bins are measured over the window's main lobe.</p>
          <Plot x={fftData.f} xLabel="Frequency" xUnit="Hz" log traces={fftData.traces} height={H} />
          <ul class="small">
            {fftData.thd.map(({ name, unit, r }) => r && <li key={name}>{name}: strongest component {formatValue(r.amp, unit)} at {formatValue(r.f0, 'Hz')}, THD {r.thd < 0.01 ? '< 0.01' : r.thd.toPrecision(3)} % (harmonics 2 to 10)</li>)}
          </ul>
        </section>
      )}
      {cur.a !== null && cur.b !== null && (
        <p class="small">ΔX = {formatValue(cur.b - cur.a, xUnit)}{!log && xUnit === 's' && cur.b !== cur.a ? ` · 1/ΔX = ${formatValue(1 / Math.abs(cur.b - cur.a), 'Hz')}` : ''}</p>
      )}
    </div>
  );
}
