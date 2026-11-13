import { CLOSED_PROJECT_STATUS } from '@pm/shared';
import { LoginLimiter } from '../auth/loginLimiter';
import type { Deps } from '../http';
import { saveEvmSnapshot } from '../routes/performance';
import { utc } from '../sqlTime';

/** Un anexo pendiente se descarta si no se confirmó en este tiempo. */
const PENDING_UPLOAD_MS = 24 * 3_600_000;

/**
 * Limpieza y fotos de valor ganado, una vez al día (función programada de Netlify).
 * Devuelve cuántos registros tocó cada paso.
 */
export async function runDailyJobs(deps: Deps): Promise<{ sessions: number; loginAttempts: number; pendingUploads: number; snapshots: number }> {
  const { prisma, files } = deps;
  const now = deps.now();

  const sessions = (await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
  const loginAttempts = await new LoginLimiter(prisma).purge(now);

  // Primero se reclaman las filas: un anexo que se confirme al mismo tiempo ya no cumple
  // `uploadedAt IS NULL`, así que no se borra ni pierde su archivo.
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_MS);
  const claimed = await prisma.$queryRaw<{ storedName: string }[]>`
    DELETE FROM "Attachment"
    WHERE "uploadedAt" IS NULL AND "createdAt" <= ${utc(cutoff)}
    RETURNING "storedName"`;
  const pendingUploads = claimed.length;
  let storageError: unknown = null;
  try {
    await files.remove(claimed.map((a) => a.storedName));
  } catch (error) {
    // Las fotos de valor ganado no deben depender de Storage: se sigue y se informa al final.
    storageError = error;
    console.error(`No se pudieron borrar los archivos de ${pendingUploads} anexos pendientes: ${claimed.map((a) => a.storedName).join(', ')}`, error);
  }

  const today = deps.today();
  const projects = await prisma.project.findMany({
    where: { status: { notIn: [...CLOSED_PROJECT_STATUS] }, baselines: { some: {} } },
    select: { id: true },
  });
  let snapshots = 0;
  for (const project of projects) if (await saveEvmSnapshot(prisma, project.id, today)) snapshots += 1;

  const result = { sessions, loginAttempts, pendingUploads, snapshots };
  if (storageError) {
    throw new Error(`La tarea diaria terminó con errores al borrar los archivos de anexos pendientes: ${JSON.stringify(result)}`, { cause: storageError });
  }
  return result;
}
