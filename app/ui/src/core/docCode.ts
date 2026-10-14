// Documented code in the help pages: a line "@code <file> <name>" in a page is replaced by the
// current source of that function, class or method (with its doc comment), so the technical
// reference always shows the code the app runs. <name> is a function or class name, or
// "Class.method". tests/docs.test.ts checks that every marker resolves.

const SOURCES = import.meta.glob(['../sim/*.ts', '../eda/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Source text by path relative to src ("sim/fft.ts"). */
export function sourceOf(file: string): string | undefined {
  return SOURCES[`../${file}`];
}

/** Index of the brace that closes the block opened at `open` (strings and comments skipped). */
function blockEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The brace that opens a function's body: after its parameter list and its return type, whose
 *  object types ("): { a: number } {") are skipped. */
function bodyBrace(src: string, at: number): number {
  let i = src.indexOf('(', at);
  if (i < 0) return -1;
  // the parameter list
  for (let d = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '(') d++;
    else if (c === ')' && --d === 0) break;
  }
  // the return type: a '{' after ':', '|', '&', ',' or '<' is an object type, otherwise the body
  let prev = ')';
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) continue;
    if (c === '{') {
      if (':|&,<'.includes(prev)) { i = blockEnd(src, i); prev = '}'; continue; }
      return i;
    }
    if (c === '=' && src[i + 1] === '>') { i++; prev = '>'; continue; }
    prev = c;
  }
  return -1;
}

/** The declaration of `name` in `src`, with the doc comment right above it, or null. */
export function extract(src: string, name: string): string | null {
  const [outer, member] = name.split('.');
  let from = 0, to = src.length;
  if (member) {
    const m = new RegExp(`^(export )?(abstract )?class ${outer}\\b`, 'm').exec(src);
    if (!m) return null;
    const open = src.indexOf('{', m.index);
    from = open; to = blockEnd(src, open);
  }
  const target = member ?? outer;
  const pat = member
    ? new RegExp(`^ {2}(private |protected |public |static |get )*${target}\\s*[(<]`, 'm')
    : new RegExp(`^(export )?(async )?(abstract )?(function|class|const|interface|type) ${target}\\b`, 'm');
  const scope = src.slice(from, to);
  const m = pat.exec(scope);
  if (!m) return null;
  let start = from + m.index;
  // the doc comment and line comments directly above
  const before = src.slice(0, start).split('\n');
  before.pop();
  let k = before.length - 1;
  if (k >= 0 && /\*\/\s*$/.test(before[k])) { while (k >= 0 && !/^\s*\/\*\*/.test(before[k])) k--; }
  else while (k >= 0 && /^\s*\/\//.test(before[k])) k--;
  if (k < before.length - 1) start -= before.slice(k >= 0 && /^\s*\/\*\*/.test(before[k]) ? k : k + 1).join('\n').length + 1;
  // to the end of the body (or of the statement for consts and types without a body)
  const at = from + m.index;
  const brace = /function|\(|</.test(m[0]) || member ? bodyBrace(src, at) : /class|interface/.test(m[0]) ? src.indexOf('{', at) : -1;
  const end = brace >= 0 ? blockEnd(src, brace) : src.indexOf(';\n', at);
  if (end < 0) return null;
  const text = src.slice(start, end + 1);
  // dedent members
  const lines = text.split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** Replaces every "@code <file> <name>" line by a fenced TypeScript block with a caption. */
export function expandCode(md: string): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = md.replace(/^@code (\S+) (\S+)\s*$/gm, (_, file: string, name: string) => {
    const src = sourceOf(file);
    const code = src ? extract(src, name) : null;
    if (!code) { missing.push(`${file} ${name}`); return `> (code ${file} ${name} not found)`; }
    return `<p class="code-caption">app/ui/src/${file} — <code>${name}</code></p>\n\n\`\`\`ts\n${code}\n\`\`\``;
  });
  return { text, missing };
}
