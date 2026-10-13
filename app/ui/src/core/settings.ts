// UI-21: light and dark themes, font scaling 80 % to 200 %.

export type Theme = 'light' | 'dark' | 'system';

/** Schematic editor layout and behaviour (Increment 2). */
export interface SchematicPrefs {
  /** Where the waveform viewer sits: below the schematic (LTspice "tile horizontally") or beside it ("tile vertically"). */
  results: 'below' | 'beside';
  /** Share of the space taken by the schematic when results are shown (0.2–0.8). */
  split: number;
  /** One pane can fill the space. */
  maximize: 'none' | 'schematic' | 'results';
  showLibrary: boolean;
  showSide: boolean;
  /** A wire or edit that would touch another net: ask, always connect, or route wires around. */
  collision: 'ask' | 'connect' | 'avoid';
}

export interface UiSettings {
  theme: Theme;
  fontScale: number;
  highlightMode: 'direct' | 'transitive';
  mode: 'guided' | 'expert';
  sch: SchematicPrefs;
}

export const SCH_DEFAULTS: SchematicPrefs = { results: 'below', split: 0.6, maximize: 'none', showLibrary: true, showSide: true, collision: 'ask' };
export const DEFAULTS: UiSettings = { theme: 'system', fontScale: 1, highlightMode: 'direct', mode: 'expert', sch: SCH_DEFAULTS };
export const FONT_MIN = 0.8;
export const FONT_MAX = 2.0;

export function clampScale(x: number): number {
  const r = Math.round(x * 10) / 10;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, r));
}

export function sanitise(raw: unknown): UiSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'system' ? o.theme : DEFAULTS.theme,
    fontScale: typeof o.fontScale === 'number' && Number.isFinite(o.fontScale) ? clampScale(o.fontScale) : DEFAULTS.fontScale,
    highlightMode: o.highlightMode === 'transitive' ? 'transitive' : 'direct',
    mode: o.mode === 'guided' ? 'guided' : 'expert',
    sch: sanitiseSch(o.sch),
  };
}

export function sanitiseSch(raw: unknown): SchematicPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = SCH_DEFAULTS;
  const split = typeof o.split === 'number' && Number.isFinite(o.split) ? Math.min(0.8, Math.max(0.2, o.split)) : d.split;
  return {
    results: o.results === 'beside' ? 'beside' : 'below',
    split,
    maximize: o.maximize === 'schematic' || o.maximize === 'results' ? o.maximize : 'none',
    showLibrary: typeof o.showLibrary === 'boolean' ? o.showLibrary : d.showLibrary,
    showSide: typeof o.showSide === 'boolean' ? o.showSide : d.showSide,
    collision: o.collision === 'connect' || o.collision === 'avoid' ? o.collision : 'ask',
  };
}

export function resolvedTheme(t: Theme, prefersDark: boolean): 'light' | 'dark' {
  return t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
}
