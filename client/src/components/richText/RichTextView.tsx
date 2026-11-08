import { isBlankRichText, RICH_TEXT_TAGS, toPlainText } from '@pm/shared';
import DOMPurify from 'dompurify';
import { toEditorHtml } from './RichTextEditor';

const VIEW_CLASS =
  'text-sm text-ink [overflow-wrap:anywhere] [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold';

/** Muestra un texto con formato, limpio de todo lo que no esté permitido. */
export function RichTextView({ html, empty = '—' }: { html: string; empty?: string }) {
  if (isBlankRichText(html)) return <p className="text-sm text-ink-soft">{empty}</p>;
  const clean = DOMPurify.sanitize(toEditorHtml(html), { ALLOWED_TAGS: [...RICH_TEXT_TAGS], ALLOWED_ATTR: [] });
  return <div className={VIEW_CLASS} dangerouslySetInnerHTML={{ __html: clean }} />;
}

/** Texto plano recortado a dos líneas, para tablas y listas. */
export function RichTextClamp({ html }: { html: string }) {
  const text = toPlainText(html);
  return (
    <span className="line-clamp-2" title={text}>
      {text}
    </span>
  );
}
