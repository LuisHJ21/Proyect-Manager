import type { Readable } from 'node:stream';

/** Dirección a la que el navegador envía el archivo, sin pasar por la API. */
export type UploadTarget = { url: string; method: 'PUT'; headers: Record<string, string> };

/** Una descarga se sirve redirigiendo a una dirección firmada o enviando el contenido. */
export type DownloadTarget = { redirect: string } | { stream: Readable };

/** Almacén de los archivos de anexos: disco en local y en pruebas, Supabase Storage en producción. */
export interface FileStore {
  createUpload(storedName: string, mimeType: string): Promise<UploadTarget>;
  /** Tamaño real del archivo, o `null` si no existe. */
  stat(storedName: string): Promise<{ size: number } | null>;
  download(storedName: string, filename: string): Promise<DownloadTarget>;
  /** Borra los archivos. Ignora los que ya no existan. */
  remove(storedNames: string[]): Promise<void>;
}
