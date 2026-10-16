// A small Markdown reader for the design documents (D29): headings, paragraphs, bullet and
// numbered lists, pipe tables and bold or italic runs; enough for the app's own help pages
// and design documentation.

export interface Run { text: string; bold?: boolean; italic?: boolean }
export type Block =
  | { t: 'h'; level: number; runs: Run[] }
  | { t: 'p'; runs: Run[] }
  | { t: 'li'; runs: Run[]; ordered: boolean; n: number }
  | { t: 'table'; rows: Run[][][]; header: boolean };

/** Inline text to runs: **bold**, *italic* or _italic_, `code` (plain), [text](link) (text). */
export function runs(s: string): Run[] {
  const out: Run[] = [];
  const t = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/~~([^~]*)~~/g, '$1');
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push({ text: t.slice(last, m.index) });
    if (m[2]) out.push({ text: m[2], bold: true }); else out.push({ text: m[3] ?? m[4], italic: true });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ text: t.slice(last) });
  return out.filter((r) => r.text.length);
}

export function parseMd(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', runs: runs(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { flush(); out.push({ t: 'h', level: h[1].length, runs: runs(h[2]) }); continue; }
    if (/^\s*\|/.test(l)) {
      flush();
      const rows: Run[][][] = [];
      let header = false;
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { header = rows.length === 1; continue; }
        rows.push(cells.map(runs));
      }
      i--;
      out.push({ t: 'table', rows, header });
      continue;
    }
    const li = /^\s*([-*]|(\d+)\.)\s+(.*)$/.exec(l);
    if (li) {
      flush();
      let text = li[3];
      // continuation lines of the item
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i + 1])) text += ` ${lines[++i].trim()}`;
      out.push({ t: 'li', runs: runs(text), ordered: !!li[2], n: li[2] ? Number(li[2]) : 0 });
      continue;
    }
    para.push(l.trim());
  }
  flush();
  return out;
}

/** The section of a Markdown text under the heading that starts with `title` (to the next
 *  heading of the same or a higher level). */
export function mdSection(md: string, title: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, '').startsWith(title));
  if (start < 0) return '';
  const level = /^(#+)/.exec(lines[start])![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { const m = /^(#+)\s/.exec(lines[i]); if (m && m[1].length <= level) { end = i; break; } }
  return lines.slice(start, end).join('\n');
}
