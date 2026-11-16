import type { DependencyType } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { App } from '../http';
import { getProjectAccess } from '../auth/access';
import { criticalPath } from '../domain/criticalPath';
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
