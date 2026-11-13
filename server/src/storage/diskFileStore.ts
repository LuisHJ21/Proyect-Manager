import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DownloadTarget, FileStore, UploadTarget } from './fileStore';

/** Archivos en una carpeta del disco. La subida pasa por `PUT /api/local-uploads/:storedName`. */
export class DiskFileStore implements FileStore {
  constructor(private readonly dir: string) {}

  /** Ruta en disco. Un nombre con separadores nunca sale de la carpeta. */
  private path(storedName: string): string {
    if (basename(storedName) !== storedName || storedName === '' || storedName === '.' || storedName === '..') {
      throw new Error(`Nombre de archivo inválido: ${storedName}`);
    }
    return join(this.dir, storedName);
  }

  async createUpload(storedName: string, mimeType: string): Promise<UploadTarget> {
    return { url: `/api/local-uploads/${encodeURIComponent(storedName)}`, method: 'PUT', headers: { 'content-type': mimeType } };
  }

  async stat(storedName: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.path(storedName));
      return info.isFile() ? { size: info.size } : null;
    } catch {
      return null;
    }
  }

  async download(storedName: string): Promise<DownloadTarget> {
    return { stream: createReadStream(this.path(storedName)) };
  }

  async remove(storedNames: string[]): Promise<void> {
    await Promise.all(storedNames.map((name) => rm(this.path(name), { force: true })));
  }

  /** Guarda el contenido. Si la escritura falla no deja residuos. */
  async put(storedName: string, data: Buffer | Readable): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = this.path(storedName);
    try {
      await pipeline(Buffer.isBuffer(data) ? Readable.from([data]) : data, createWriteStream(path));
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }
}
