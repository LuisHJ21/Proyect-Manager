import { describe, expect, it } from 'vitest';
import { CHARTER_RICH_FIELDS, hasHtmlTags, isBlankRichText, plainToHtml, toPlainText } from '../src/richText';

describe('texto con formato', () => {
  it('toPlainText conserva el texto visible de las etiquetas permitidas', () => {
    expect(toPlainText('<h3>Título</h3><p><strong>Uno</strong> y <em>dos</em></p><ul><li>a</li><li>b</li></ul>')).toBe('Título Uno y dos a b');
  });
  it('toPlainText decodifica entidades', () => {
    expect(toPlainText('<p>a &lt; b &amp; c&nbsp;d</p>')).toBe('a < b & c d');
  });
  it('toPlainText deja intacto el texto plano salvo los espacios', () => {
    expect(toPlainText('a < b &amp;\n  c')).toBe('a < b &amp; c');
  });
  it.each(['', '<p></p>', '<p> </p>', '<p><br></p>', '<ul><li></li></ul>'])('isBlankRichText(%j) es verdadero', (html) => {
    expect(isBlankRichText(html)).toBe(true);
  });
  it('isBlankRichText es falso con texto', () => expect(isBlankRichText('<p>x</p>')).toBe(false));
  it('plainToHtml escapa y crea un párrafo por línea no vacía', () => {
    expect(plainToHtml('a < b & "c"\n\nsegunda')).toBe('<p>a &lt; b &amp; &quot;c&quot;</p><p>segunda</p>');
    expect(plainToHtml('  \n ')).toBe('');
  });
  it('hasHtmlTags distingue texto plano de HTML', () => {
    expect(hasHtmlTags('a < b')).toBe(false);
    expect(hasHtmlTags('<p>a</p>')).toBe(true);
  });
  it('CHARTER_RICH_FIELDS no incluye al patrocinador', () => {
    expect(CHARTER_RICH_FIELDS).toHaveLength(7);
    expect(CHARTER_RICH_FIELDS).not.toContain('sponsor');
  });
});
