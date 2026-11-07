import { hasHtmlTags, isBlankRichText, plainToHtml, RICH_TEXT_TAGS } from '@pm/shared';
import sanitizeHtml from 'sanitize-html';

/** Deja solo las etiquetas permitidas, sin atributos. El texto sin etiquetas se convierte en párrafos. */
export function sanitizeRichText(input: string): string {
  const html = hasHtmlTags(input)
    ? sanitizeHtml(input, {
        allowedTags: [...RICH_TEXT_TAGS],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
      })
    : plainToHtml(input);
  return isBlankRichText(html) ? '' : html;
}

/** Copia del cuerpo con los campos indicados ya limpios. Lo que no es objeto se devuelve igual para que Zod dé su error. */
export function sanitizeFields<T>(body: T, fields: readonly string[]): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const field of fields) {
    if (typeof copy[field] === 'string') copy[field] = sanitizeRichText(copy[field] as string);
  }
  return copy as T;
}
