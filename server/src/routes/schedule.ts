import { rescheduleSchema, type DependencyType } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess } from '../auth/access';
import { criticalPath, proposeReschedule } from '../domain/criticalPath';
import { isWithinProject } from '../domain/projectDates';
import { AppError, forbidden } from '../errors';
import { getTaskAccess } from './tasks';
import { leafWhere } from '../domain/wbs';

type Db = PrismaClient | Prisma.TransactionClient;

/** Hojas del proyecto con sus fechas y las dependencias entre ellas, listas para el cálculo. */
export async function loadSchedule(db: Db, projectId: string) {
  const [project, leaves, dependencies] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { endDate: true } }),
    db.task.findMany({ where: { projectId, ...leafWhere }, select: { id: true, title: true, startDate: true, dueDate: true } }),
    db.taskDependency.findMany({ where: { successor: { projectId } }, select: { predecessorId: true, successorId: true, type: true, lagDays: true } }),
  ]);
  const dated = leaves.filter((t): t is typeof t & { startDate: string; dueDate: string } => Boolean(t.startDate && t.dueDate));
  return {
    projectEnd: project.endDate,
    leaves,
    dated,
    dependencies: dependencies.map((d) => ({ ...d, type: d.type as DependencyType })),
  };
}

export function scheduleRoutes(app: App) {
  /** Propone (apply: false) o guarda (apply: true) nuevas fechas para las sucesoras en conflicto. Solo el PM. */
  app.post('/api/tasks/:id/reschedule', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm) throw forbidden();
    const { apply } = rescheduleSchema.parse(await readBody(c));
    const { dated, dependencies } = await loadSchedule(prisma, task.projectId);
    const changes = proposeReschedule(task.id, dated, dependencies);
    if (!apply || changes.length === 0) return c.json({ changes, applied: false });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId }, select: { startDate: true, endDate: true } });
    const outside = changes.filter((ch) => !isWithinProject(ch.to.startDate, project) || !isWithinProject(ch.to.dueDate, project));
    if (outside.length > 0) {
      const titles = new Map(dated.map((t) => [t.id, t.title]));
      throw new AppError(409, 'reschedule_outside', `La reprogramación deja tareas fuera del proyecto: ${outside.map((ch) => titles.get(ch.id)).join(', ')}`);
    }
    await prisma.$transaction(
      changes.map((ch) => prisma.task.update({ where: { id: ch.id }, data: { ...ch.to, version: { increment: 1 } } })),
    );
    return c.json({ changes, applied: true });
  });

  /** Holgura y ruta crítica de las hojas con fechas. No lleva costos: lo lee todo el equipo. */
  app.get('/api/projects/:id/schedule', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const { projectEnd, leaves, dated, dependencies } = await loadSchedule(c.var.deps.prisma, project.id);
    const result = criticalPath(dated, dependencies, projectEnd);
    const undated = leaves.filter((t) => !t.startDate || !t.dueDate).map((t) => t.id);
    return c.json({
      tasks: [...result.tasks.entries()].map(([id, r]) => ({ id, ...r })),
      critical: result.critical,
      unscheduled: [...new Set([...undated, ...result.unscheduled])],
    });
  });
}
