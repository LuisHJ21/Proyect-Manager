import type { Readable } from 'node:stream';
import type { Prisma, PrismaClient } from '@prisma/client';

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

/**
 * Borra los archivos de registros que ya se eliminaron. Si el almacén falla, lo anota en el registro
 * y sigue: el borrado en la base ya ocurrió y la petición no debe responder como fallida.
 */
export async function queueFileDeletion(tx: Prisma.TransactionClient, storedNames: string[]): Promise<void> {
  if (storedNames.length) await tx.fileDeletion.createMany({ data: storedNames.map((storedName) => ({ storedName })), skipDuplicates: true });
}

export async function removeAfterDelete(prisma: PrismaClient, files: FileStore, storedNames: string[]): Promise<void> {
  if (!storedNames.length) return;
  try {
    await files.remove(storedNames);
    await prisma.fileDeletion.deleteMany({ where: { storedName: { in: storedNames } } });
  } catch (error) {
    console.error(`No se pudieron borrar ${storedNames.length} archivos del almacén: ${storedNames.join(', ')}`, error);
  }
}
