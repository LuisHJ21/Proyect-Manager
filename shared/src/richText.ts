/** Etiquetas que admite el texto con formato. Ninguna lleva atributos. */
export const RICH_TEXT_TAGS = ['p', 'br', 'strong', 'em', 'h3', 'ul', 'ol', 'li'] as const;

/** Campos del acta que se escriben con formato. El patrocinador sigue siendo texto simple. */
export const CHARTER_RICH_FIELDS = [
  'justification',
  'scopeIncluded',
  'scopeExcluded',
  'boundaries',
  'assumptions',
  'constraints',
  'successCriteria',
] as const;

// Solo cuentan las etiquetas permitidas: un correo como <ana@x.com> o una marca como <nombre> es texto plano.
const TAG = new RegExp(`</?(${RICH_TEXT_TAGS.join('|')})\\b[^>]*>`, 'i');

/** Verdadero si el texto contiene alguna de las etiquetas permitidas. */
export const hasHtmlTags = (text: string) => TAG.test(text);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Convierte texto plano en párrafos escapados, uno por línea no vacía. */
export function plainToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Texto visible en una sola línea, sin etiquetas. */
export function toPlainText(html: string): string {
  if (!hasHtmlTags(html)) return html.replace(/\s+/g, ' ').trim();
  return html
    .replace(/<br\s*\/?>|<\/(p|h3|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un campo con formato sin texto visible cuenta como vacío. */
export const isBlankRichText = (html: string) => toPlainText(html) === '';
