/** Limpia el nombre recibido: los navegadores envían las comillas como %22. Nunca se usa como ruta en disco. */
export function normalizeUploadName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/%22/g, '"').replace(/[\r\n]/g, '').trim() || 'archivo';
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
