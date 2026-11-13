import { createClient } from '@supabase/supabase-js';
import type { DownloadTarget, FileStore, UploadTarget } from './fileStore';

/** Validez de la dirección de descarga, en segundos. */
const DOWNLOAD_SECONDS = 60;

/** Error de Storage que indica que el objeto no existe. */
const isNotFound = (error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  return status === 404 || status === 400;
};

/**
 * Archivos en un bucket privado de Supabase Storage. Usa la clave de servicio, que solo vive en el
 * servidor: al navegador solo llegan direcciones firmadas.
 */
export class SupabaseFileStore implements FileStore {
  private readonly bucket;

  constructor(opts: { url: string; serviceRoleKey: string; bucket: string }) {
    const client = createClient(opts.url, opts.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    this.bucket = client.storage.from(opts.bucket);
  }

  async createUpload(storedName: string, mimeType: string): Promise<UploadTarget> {
    const { data, error } = await this.bucket.createSignedUploadUrl(storedName);
    if (error) throw error;
    // Los mismos encabezados que envía `uploadToSignedUrl` de storage-js con un cuerpo crudo.
    // La autorización va en el token de la dirección; nunca se envían las claves del cliente.
    return {
      url: data.signedUrl,
      method: 'PUT',
      headers: { 'content-type': mimeType, 'cache-control': 'max-age=3600', 'x-upsert': 'false' },
    };
  }

  async stat(storedName: string): Promise<{ size: number } | null> {
    const { data, error } = await this.bucket.info(storedName);
    if (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const size = data.size ?? (data.metadata as { size?: unknown } | undefined)?.size;
    // Sin tamaño no se puede comprobar el límite de 25 MB: mejor fallar que aceptar a ciegas.
    if (typeof size !== 'number') throw new Error(`Storage no informó el tamaño de ${storedName}`);
    return { size };
  }

  async download(storedName: string, filename: string): Promise<DownloadTarget> {
    const { data, error } = await this.bucket.createSignedUrl(storedName, DOWNLOAD_SECONDS, { download: filename });
    if (error) throw error;
    return { redirect: data.signedUrl };
  }

  async remove(storedNames: string[]): Promise<void> {
    if (storedNames.length === 0) return;
    const { error } = await this.bucket.remove(storedNames);
    if (error) throw error;
  }
}
