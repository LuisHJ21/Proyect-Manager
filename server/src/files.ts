import { rm } from 'node:fs/promises';
import { join } from 'node:path';

export const uploadsDir = (dataDir: string) => join(dataDir, 'uploads');

/** Borra archivos de anexos. Ignora los que ya no existan. */
export async function removeStoredFiles(dataDir: string, storedNames: string[]): Promise<void> {
  await Promise.all(storedNames.map((name) => rm(join(uploadsDir(dataDir), name), { force: true })));
}
