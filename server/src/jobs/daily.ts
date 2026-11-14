import { addDays, CLOSED_PROJECT_STATUS } from '@pm/shared';
import { LoginLimiter } from '../auth/loginLimiter';
import type { Deps } from '../http';
import { saveEvmSnapshot } from '../routes/performance';
import { notify } from '../notifications';
import { utc } from '../sqlTime';

/** Un anexo pendiente se descarta si no se confirmó en este tiempo. */
const PENDING_UPLOAD_MS = 24 * 3_600_000;
/** Los avisos se borran después de este tiempo. */
const NOTIFICATION_TTL_MS = 90 * 24 * 3_600_000;

/**
 * Limpieza y fotos de valor ganado, una vez al día (función programada de Netlify).
 * Devuelve cuántos registros tocó cada paso.
 */
export async function runDailyJobs(deps: Deps): Promise<{
  sessions: number;
  loginAttempts: number;
  pendingUploads: number;
  snapshots: number;
  dueSoon: number;
  overdue: number;
  oldNotifications: number;
}> {
  const { prisma, files } = deps;
  const now = deps.now();

  const sessions = (await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
  const loginAttempts = await new LoginLimiter(prisma).purge(now);
  const { dueSoon, overdue } = await notifyDueTasks(deps);
  const oldNotifications = (await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - NOTIFICATION_TTL_MS) } } })).count;

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

  const result = { sessions, loginAttempts, pendingUploads, snapshots, dueSoon, overdue, oldNotifications };
  if (storageError) {
    throw new Error(`La tarea diaria terminó con errores al borrar los archivos de anexos pendientes: ${JSON.stringify(result)}`, { cause: storageError });
  }
  return result;
}

/**
 * Avisa a los responsables de las tareas no hechas que vencen mañana o vencieron ayer, en proyectos abiertos.
 * La clave por tarea y fecha impide repetir el aviso si la tarea diaria corre dos veces.
 */
async function notifyDueTasks(deps: Deps): Promise<{ dueSoon: number; overdue: number }> {
  const today = deps.today();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const tasks = await deps.prisma.task.findMany({
    where: { dueDate: { in: [tomorrow, yesterday] }, status: { not: 'DONE' }, project: { status: { notIn: [...CLOSED_PROJECT_STATUS] } } },
    select: { id: true, projectId: true, title: true, dueDate: true, assignees: { select: { userId: true } } },
  });
  const counts = { dueSoon: 0, overdue: 0 };
  for (const task of tasks) {
    const kind = task.dueDate === tomorrow ? 'TASK_DUE_SOON' : 'TASK_OVERDUE';
    const created = await notify(deps.prisma, {
      kind,
      projectId: task.projectId,
      entityId: task.id,
      title: task.title,
      userIds: task.assignees.map((a) => a.userId),
      dedupeKey: `${kind}:${task.id}:${task.dueDate}`,
    });
    counts[kind === 'TASK_DUE_SOON' ? 'dueSoon' : 'overdue'] += created;
  }
  return counts;
}
