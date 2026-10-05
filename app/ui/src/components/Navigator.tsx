import { useEffect, useRef, useState } from 'preact/hooks';
import type { TreeNode } from '../core/projectModel';
import { visibleIds } from '../core/projectModel';
import type { Highlight, HighlightBus } from '../core/highlightBus';

interface Props {
  tree: TreeNode;
  bus: HighlightBus;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
}

function find(n: TreeNode, id: string): TreeNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return undefined;
}

function parentOf(n: TreeNode, id: string, p?: TreeNode): TreeNode | undefined {
  if (n.id === id) return p;
  for (const c of n.children ?? []) {
    const f = parentOf(c, id, n);
    if (f) return f;
  }
  return undefined;
}

/** UI-01 project navigator: ARIA tree with full keyboard support (UI-20). */
export function Navigator({ tree, bus, onOpen, onSelect }: Props) {
  const [expanded, setExpanded] = useState(new Set(['project', 'requirements', 'blocks']));
  const [focus, setFocus] = useState('project');
  const [hl, setHl] = useState<Highlight>(bus.state);
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => bus.subscribe('navigator', setHl), [bus]);
  useEffect(() => {
    const id = requestAnimationFrame(() => bus.ack('navigator', hl.seq));
    return () => cancelAnimationFrame(id);
  }, [hl, bus]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focus)}"]`)?.focus();
  }, [focus]);

  const toggle = (id: string, open?: boolean) => {
    const s = new Set(expanded);
    (open ?? !s.has(id)) ? s.add(id) : s.delete(id);
    setExpanded(s);
  };

  const onKey = (e: KeyboardEvent) => {
    const ids = visibleIds(tree, expanded);
    const i = ids.indexOf(focus);
    const node = find(tree, focus);
    const hasKids = !!node?.children?.length;
    switch (e.key) {
      case 'ArrowDown': if (i < ids.length - 1) setFocus(ids[i + 1]); break;
      case 'ArrowUp': if (i > 0) setFocus(ids[i - 1]); break;
      case 'Home': setFocus(ids[0]); break;
      case 'End': setFocus(ids[ids.length - 1]); break;
      case 'ArrowRight': if (hasKids) expanded.has(focus) ? setFocus(node!.children![0].id) : toggle(focus, true); break;
      case 'ArrowLeft': if (hasKids && expanded.has(focus)) toggle(focus, false); else { const p = parentOf(tree, focus); if (p) setFocus(p.id); } break;
      case 'Enter': case ' ': if (node?.kind) { onSelect(focus); onOpen(focus); } else if (hasKids) toggle(focus); break;
      default: return;
    }
    e.preventDefault();
  };

  const render = (n: TreeNode, level: number) => {
    const open = expanded.has(n.id);
    const kids = n.children ?? [];
    const cls = ['tree-item', hl.selected === n.id ? 'is-selected' : '', hl.related.has(n.id) ? 'is-related' : ''].join(' ');
    return (
      <li role="treeitem" aria-level={level} aria-expanded={kids.length ? open : undefined}
          aria-selected={hl.selected === n.id} key={n.id}>
        <div class={cls} data-id={n.id} tabIndex={focus === n.id ? 0 : -1}
             onClick={() => { setFocus(n.id); if (n.kind) { onSelect(n.id); onOpen(n.id); } else if (kids.length) toggle(n.id); }}>
          {kids.length ? <span class="twisty" aria-hidden="true">{open ? '▾' : '▸'}</span> : <span class="twisty" aria-hidden="true" />}
          <span>{n.label}</span>
          {n.note && <span class="note"> · {n.note}</span>}
        </div>
        {kids.length > 0 && open && <ul role="group">{kids.map((c) => render(c, level + 1))}</ul>}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label="Project navigator" class="tree" ref={ref} onKeyDown={onKey}>
      {render(tree, 1)}
    </ul>
  );
}
