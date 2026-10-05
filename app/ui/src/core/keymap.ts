// UI-20: every function reachable by keyboard. Every command is registered here; it is always
// reachable through the command palette (Ctrl+Shift+P), and may also have a direct shortcut.

export interface AppCommand {
  id: string;
  title: string;
  /** e.g. "Ctrl+Z", "Ctrl+Shift+P", "F6", "Alt+1" */
  keys?: string;
  category: string;
  run: () => void;
  enabled?: () => boolean;
}

export function normaliseKeys(s: string): string {
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? '';
  const mods = parts.map((m) => m.toLowerCase()).map((m) => (m === 'cmd' || m === 'meta' ? 'ctrl' : m));
  const order = ['ctrl', 'alt', 'shift'];
  const sorted = order.filter((m) => mods.includes(m));
  const k = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  return [...sorted.map((m) => m[0].toUpperCase() + m.slice(1)), k].join('+');
}

export function eventKeys(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && e.key.length > 1) mods.push('Shift'); // Shift+letter arrives as an upper-case key
  if (e.shiftKey && e.key.length === 1 && /[a-z]/i.test(e.key) && (e.ctrlKey || e.metaKey || e.altKey)) mods.push('Shift');
  return normaliseKeys([...mods, e.key].join('+'));
}

export class Keymap {
  private cmds = new Map<string, AppCommand>();
  private byKey = new Map<string, string>();

  register(c: AppCommand): void {
    if (this.cmds.has(c.id)) throw new Error(`duplicate command id ${c.id}`);
    if (c.keys) {
      const k = normaliseKeys(c.keys);
      const other = this.byKey.get(k);
      if (other) throw new Error(`shortcut ${k} of ${c.id} already used by ${other}`);
      this.byKey.set(k, c.id);
    }
    this.cmds.set(c.id, c);
  }

  /** Runs the command bound to the key combination; returns true when handled. */
  handle(keys: string): boolean {
    const id = this.byKey.get(normaliseKeys(keys));
    if (!id) return false;
    return this.run(id);
  }

  run(id: string): boolean {
    const c = this.cmds.get(id);
    if (!c || (c.enabled && !c.enabled())) return false;
    c.run();
    return true;
  }

  /** Command palette search: every word of the query must appear in title, category or id. */
  search(q: string): AppCommand[] {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...this.cmds.values()]
      .filter((c) => words.every((w) => `${c.title} ${c.category} ${c.id}`.toLowerCase().includes(w)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }

  all(): AppCommand[] {
    return [...this.cmds.values()];
  }
}
