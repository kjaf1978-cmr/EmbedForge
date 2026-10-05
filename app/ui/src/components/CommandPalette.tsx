import { useEffect, useRef, useState } from 'preact/hooks';
import type { Keymap } from '../core/keymap';

/** UI-20: every command in one searchable, keyboard-driven list. */
export function CommandPalette({ keymap, onClose }: { keymap: Keymap; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = keymap.search(q);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);
  const run = (id: string) => { onClose(); keymap.run(id); };
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Command palette"
         onKeyDown={(e) => {
           if (e.key === 'Escape') { onClose(); e.preventDefault(); }
           else if (e.key === 'ArrowDown') { setSel(Math.min(items.length - 1, sel + 1)); e.preventDefault(); }
           else if (e.key === 'ArrowUp') { setSel(Math.max(0, sel - 1)); e.preventDefault(); }
           else if (e.key === 'Enter' && items[sel]) { run(items[sel].id); e.preventDefault(); }
         }}>
      <div class="palette">
        <input ref={input} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)}
               placeholder="Type a command…" aria-label="Search commands" aria-controls="palette-list"
               aria-activedescendant={items[sel] ? `cmd-${items[sel].id}` : undefined} />
        <ul id="palette-list" role="listbox" aria-label="Commands">
          {items.map((c, i) => (
            <li id={`cmd-${c.id}`} role="option" aria-selected={i === sel} class={i === sel ? 'is-active' : ''}
                onMouseDown={(e) => { e.preventDefault(); run(c.id); }} key={c.id}>
              <span class="cat">{c.category}</span> {c.title} {c.keys && <kbd>{c.keys}</kbd>}
            </li>
          ))}
          {items.length === 0 && <li class="muted">No command matches.</li>}
        </ul>
      </div>
    </div>
  );
}
