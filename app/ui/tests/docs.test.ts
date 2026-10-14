// The help pages: every "@code" marker shows real source, every page link leads to a page.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expandCode, extract, sourceOf } from '../src/core/docCode';

const dir = join(__dirname, '../src/docs');
const pages = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => ({ id: f.replace('.md', ''), body: readFileSync(join(dir, f), 'utf8') }));

describe('help pages', () => {
  it('every code marker resolves to a declaration in the source', () => {
    for (const p of pages) expect(expandCode(p.body).missing, p.id).toEqual([]);
  });
  it('the extracted code is complete: balanced braces, ends with the declaration', () => {
    for (const p of pages) for (const [, file, name] of p.body.matchAll(/^@code (\S+) (\S+)\s*$/gm)) {
      const code = extract(sourceOf(file)!, name)!;
      const opens = (code.match(/{/g) ?? []).length, closes = (code.match(/}/g) ?? []).length;
      expect(opens, `${file} ${name}`).toBe(closes);
      expect(code.trimEnd().endsWith('}') || code.trimEnd().endsWith(';'), `${file} ${name}`).toBe(true);
    }
  });
  it('every link to another page leads to an existing page', () => {
    const ids = new Set(pages.map((p) => p.id));
    for (const p of pages) for (const [, id] of p.body.matchAll(/\(#doc:([\w-]+)\)/g)) expect(ids.has(id), `${p.id} → ${id}`).toBe(true);
  });
  it('the technical reference covers FFT, sweep, Monte Carlo, harmonics and the engine', () => {
    const tech = pages.filter((p) => p.id.startsWith('tech-')).map((p) => p.body).join('\n').toLowerCase();
    for (const w of ['Hann', 'Cooley', 'THD', 'Box–Muller', 'mulberry32', 'Newton', 'trapezoidal', 'truncation error', 'modified nodal', 'scalloping']) expect(tech, w).toContain(w.toLowerCase());
  });
});
