import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useMemo } from 'preact/hooks';

/** Renders bundled markdown; output is sanitised (no scripts, no remote resources). */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(raw, { FORBID_TAGS: ['img', 'iframe', 'script', 'style'], FORBID_ATTR: ['style'] });
  }, [text]);
  return <div class="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
