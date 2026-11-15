// Which way a product's screw terminal faces (owner, 15 November: the schematics name their
// inputs and their load-side outputs): IN (a supply or source: mains, battery, PV), CTRL (a
// control or sensor input: buttons, limit switches, sensors, pots), OUT (the load side: load,
// motor, valve, pump), PE (protective earth), EXT (a part mounted off the board, e.g. a choke).
// The drawing shows the tag before the terminal's function ("IN: L mains", "OUT: L load").

export type TerminalIo = 'in' | 'ctrl' | 'out' | 'pe' | 'ext';

export const IO_TAG: Record<TerminalIo, string> = { in: 'IN', ctrl: 'CTRL', out: 'OUT', pe: 'PE', ext: 'EXT' };

/** The direction of a terminal from its function text (a design may override it). */
export function terminalIo(fn: string): TerminalIo {
  const f = fn.trim();
  if (/^PE\b/.test(f)) return 'pe';
  if (/choke|thermal cut-out of T/i.test(f)) return 'ext';
  if (/^motor\s*(A?[+−-]|\d)/i.test(f)) return 'out';
  if (/sensor|limit|beam|e-?stop|\bstop\b|start|reset|switch|\bpot\b|wiper|\bNTC\b|tank|source (COM|DRY)|key/i.test(f)) return 'ctrl';
  if (/\bload\b|\bout\b|motor|valve|vibrator|mixer|feeder|pump [LN]\b/i.test(f)) return 'out';
  return 'in';
}
