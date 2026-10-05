// UI-21: light and dark themes, font scaling 80 % to 200 %.

export type Theme = 'light' | 'dark' | 'system';

export interface UiSettings {
  theme: Theme;
  fontScale: number;
  highlightMode: 'direct' | 'transitive';
  mode: 'guided' | 'expert';
}

export const DEFAULTS: UiSettings = { theme: 'system', fontScale: 1, highlightMode: 'direct', mode: 'expert' };
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
  };
}

export function resolvedTheme(t: Theme, prefersDark: boolean): 'light' | 'dark' {
  return t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
}
