// SS-07 offline, searchable documentation: a small inverted index built in the app.

export interface DocPage {
  id: string;
  title: string;
  body: string; // markdown
}

export interface Hit {
  id: string;
  title: string;
  score: number;
  snippet: string;
}

const tokenise = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length > 1);

export class DocsIndex {
  private index = new Map<string, Map<string, number>>();
  private pages = new Map<string, DocPage>();

  constructor(pages: DocPage[]) {
    for (const p of pages) {
      this.pages.set(p.id, p);
      const weightTitle = 5;
      for (const [text, w] of [[p.title, weightTitle], [p.body, 1]] as const) {
        for (const t of tokenise(text)) {
          const m = this.index.get(t) ?? new Map<string, number>();
          m.set(p.id, (m.get(p.id) ?? 0) + w);
          this.index.set(t, m);
        }
      }
    }
  }

  search(q: string, limit = 20): Hit[] {
    const terms = tokenise(q);
    if (!terms.length) return [];
    const scores = new Map<string, number>();
    for (const [i, t] of terms.entries()) {
      // the last term is matched as a prefix, so results appear while typing
      const keys = i === terms.length - 1 ? [...this.index.keys()].filter((k) => k.startsWith(t)) : [t];
      const found = new Map<string, number>();
      for (const k of keys) for (const [id, n] of this.index.get(k) ?? []) found.set(id, (found.get(id) ?? 0) + n);
      if (i === 0) for (const [id, n] of found) scores.set(id, n);
      else for (const id of [...scores.keys()]) found.has(id) ? scores.set(id, scores.get(id)! + found.get(id)!) : scores.delete(id);
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([id, score]) => {
        const p = this.pages.get(id)!;
        return { id, title: p.title, score, snippet: snippet(p.body, terms[0]) };
      });
  }

  page(id: string): DocPage | undefined {
    return this.pages.get(id);
  }
}

function snippet(body: string, term: string): string {
  const plain = body.replace(/[#*`>|_-]+/g, ' ').replace(/\s+/g, ' ');
  const i = plain.toLowerCase().indexOf(term);
  const start = Math.max(0, i - 60);
  return (start > 0 ? '…' : '') + plain.slice(start, start + 160).trim() + '…';
}
