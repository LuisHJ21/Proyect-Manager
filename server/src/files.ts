import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const uploadsDir = (dataDir: string) => join(dataDir, 'uploads');
export const storedFilePath = (dataDir: string, storedName: string) => join(uploadsDir(dataDir), storedName);

/** Borra archivos de anexos. Ignora los que ya no existan. */
export async function removeStoredFiles(dataDir: string, storedNames: string[]): Promise<void> {
  await Promise.all(storedNames.map((name) => rm(storedFilePath(dataDir, name), { force: true })));
}

/** Guarda el archivo recibido con un nombre aleatorio. Si la escritura falla no deja residuos. */
export async function saveUpload(dataDir: string, file: File): Promise<{ storedName: string; size: number }> {
  await mkdir(uploadsDir(dataDir), { recursive: true });
  const storedName = randomUUID();
  try {
    await pipeline(Readable.fromWeb(file.stream() as import('node:stream/web').ReadableStream), createWriteStream(storedFilePath(dataDir, storedName)));
  } catch (error) {
    await removeStoredFiles(dataDir, [storedName]);
    throw error;
  }
  return { storedName, size: file.size };
}

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
