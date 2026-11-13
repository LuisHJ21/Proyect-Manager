import { CLOSED_PROJECT_STATUS } from '@pm/shared';
import { LoginLimiter } from '../auth/loginLimiter';
import type { Deps } from '../http';
import { saveEvmSnapshot } from '../routes/performance';

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

  // Primero los archivos: si borrarlos falla, los registros quedan para el siguiente intento.
  const stale = await prisma.attachment.findMany({
    where: { uploadedAt: null, createdAt: { lte: new Date(now.getTime() - PENDING_UPLOAD_MS) } },
    select: { id: true, storedName: true },
  });
  await files.remove(stale.map((a) => a.storedName));
  const pendingUploads = (await prisma.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) }, uploadedAt: null } })).count;

  const today = deps.today();
  const projects = await prisma.project.findMany({
    where: { status: { notIn: [...CLOSED_PROJECT_STATUS] }, baselines: { some: {} } },
    select: { id: true },
  });
  let snapshots = 0;
  for (const project of projects) if (await saveEvmSnapshot(prisma, project.id, today)) snapshots += 1;

  return { sessions, loginAttempts, pendingUploads, snapshots };
}
