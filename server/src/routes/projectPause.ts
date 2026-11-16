import { pauseProjectSchema, resumeDaysQuery, resumeProjectSchema } from '@pm/shared';
import type { Prisma, PrismaClient, Project, User } from '@prisma/client';
import { readBody, readQuery, type App, type Ctx } from '../http';
import { requireProjectAccess, toProjectDto } from '../auth/access';
import { requireUser } from '../auth/guards';
import { isActiveProject } from '../domain/health';
import { pauseImpact, planShift, proposedResumeDays } from '../domain/pause';
import { leafWhere } from '../domain/wbs';
import { AppError, fieldError, forbidden } from '../errors';
import { createBaseline } from './performance';

type Db = PrismaClient | Prisma.TransactionClient;

const PAUSABLE = ['PLANNING', 'EXECUTING'];
const notPaused = () => new AppError(409, 'not_paused', 'El proyecto no está en pausa');

/** Solo el PM pausa, reanuda y ve impacto, vista previa e historial. */
async function requirePmProject(c: Ctx) {
  const project = await requireProjectAccess(c, c.req.param('id')!, 'project', 'write');
  const user = requireUser(c);
  if (user.role !== 'PM') throw forbidden();
  return { project, user };
}

/** El proyecto que pasa a tener prioridad: otro proyecto activo. */
async function priorityProject(db: Db, project: Project, id: string | undefined) {
  if (!id) return null;
  const other = id === project.id ? null : await db.project.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!other || !isActiveProject(other.status)) throw fieldError('priorityProjectId', 'Elige otro proyecto activo');
  return other;
}

/** Hojas, hitos y fin del proyecto, listos para `planShift`. */
async function loadShiftInput(db: Db, project: Project) {
  const [tasks, milestones] = await Promise.all([
    db.task.findMany({ where: { projectId: project.id, ...leafWhere }, select: { id: true, title: true, status: true, startDate: true, dueDate: true }, orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }] }),
    db.milestone.findMany({ where: { projectId: project.id }, select: { id: true, name: true, dueDate: true, status: true }, orderBy: { dueDate: 'asc' } }),
  ]);
  return { tasks, milestones, endDate: project.endDate };
}

const openPause = (db: Db, projectId: string) =>
  db.projectPause.findFirst({ where: { projectId, resumedOn: null }, orderBy: { createdAt: 'desc' }, include: { priorityProject: { select: { id: true, name: true } } } });

/** Pausa abierta para el encabezado: el nombre del prioritario solo para el PM o sus miembros. */
export async function activePauseOf(db: Db, project: Project, viewer: User) {
  if (project.status !== 'PAUSED') return null;
  const pause = await openPause(db, project.id);
  if (!pause) return { pausedOn: null, reason: '', priorityProject: null };
  let priority = pause.priorityProject;
  if (priority && viewer.role !== 'PM') {
    const member = await db.projectMember.findFirst({ where: { projectId: priority.id, userId: viewer.id }, select: { userId: true } });
    if (!member) priority = null;
  }
  return { pausedOn: pause.pausedOn, reason: pause.reason, priorityProject: priority };
}

export function projectPauseRoutes(app: App) {
  app.get('/api/projects/:id/pause-impact', async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await requirePmProject(c);
    const raw = readQuery(c).priorityProjectId;
    const other = await priorityProject(prisma, project, typeof raw === 'string' && raw ? raw : undefined);
    if (!other) throw fieldError('priorityProjectId', 'Elige otro proyecto activo');
    const ids = [project.id, other.id];
    const [members, tasks] = await Promise.all([
      prisma.projectMember.findMany({ where: { projectId: { in: ids } }, include: { user: { select: { id: true, name: true } } } }),
      prisma.task.findMany({ where: { projectId: { in: ids }, ...leafWhere }, include: { assignees: { include: { user: { select: { id: true, active: true } } } } } }),
    ]);
    const byUser = new Map<string, { userId: string; name: string; projectIds: string[] }>();
    for (const m of members) {
      const entry = byUser.get(m.userId) ?? { userId: m.userId, name: m.user.name, projectIds: [] };
      entry.projectIds.push(m.projectId);
      byUser.set(m.userId, entry);
    }
    const shared = pauseImpact(
      {
        members: [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        tasks: tasks.map((t) => ({
          projectId: t.projectId,
          status: t.status,
          startDate: t.startDate,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours),
          assigneeIds: t.assignees.filter((a) => a.user.active).map((a) => a.userId),
        })),
      },
      project.id,
      other.id,
      c.var.deps.today(),
    );
    return c.json({ shared });
  });

  app.post('/api/projects/:id/pause', async (c) => {
    const { prisma } = c.var.deps;
    const { project, user } = await requirePmProject(c);
    const input = pauseProjectSchema.parse(await readBody(c));
    const other = await priorityProject(prisma, project, input.priorityProjectId);
    const updated = await prisma.$transaction(async (tx) => {
      // Reclama el cambio de estado: dos pausas a la vez dejan un solo registro.
      const { count } = await tx.project.updateMany({ where: { id: project.id, status: { in: PAUSABLE } }, data: { status: 'PAUSED' } });
      if (count === 0) throw new AppError(409, 'not_pausable', 'El proyecto ya está en pausa');
      await tx.projectPause.create({
        data: { projectId: project.id, pausedOn: c.var.deps.today(), reason: input.reason, priorityProjectId: other?.id ?? null, previousStatus: project.status, pausedById: user.id },
      });
      return tx.project.findUniqueOrThrow({ where: { id: project.id } });
    });
    return c.json(toProjectDto(updated, true));
  });

  app.get('/api/projects/:id/resume-preview', async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await requirePmProject(c);
    if (project.status !== 'PAUSED') throw notPaused();
    const query = resumeDaysQuery.parse(readQuery(c));
    const pause = await openPause(prisma, project.id);
    const proposedDays = proposedResumeDays(pause?.pausedOn ?? null, c.var.deps.today());
    const days = query.days ?? proposedDays;
    const [input, baselines] = await Promise.all([loadShiftInput(prisma, project), prisma.baseline.count({ where: { projectId: project.id } })]);
    return c.json({ proposedDays, days, changes: planShift(input, days), hasBaseline: baselines > 0 });
  });

  app.post('/api/projects/:id/resume', async (c) => {
    const { prisma } = c.var.deps;
    const { project, user } = await requirePmProject(c);
    const { days, createBaseline: withBaseline } = resumeProjectSchema.parse(await readBody(c));
    const today = c.var.deps.today();
    const updated = await prisma.$transaction(async (tx) => {
      const pause = await openPause(tx, project.id);
      const previousStatus = pause?.previousStatus ?? 'EXECUTING';
      // Reclama la reanudación: un segundo intento ya no encuentra el proyecto en pausa.
      const { count } = await tx.project.updateMany({ where: { id: project.id, status: 'PAUSED' }, data: { status: previousStatus } });
      if (count === 0) throw notPaused();
      const plan = planShift(await loadShiftInput(tx, project), days);
      for (const change of plan.tasks) {
        await tx.task.update({ where: { id: change.id }, data: { startDate: change.to.startDate, dueDate: change.to.dueDate, version: { increment: 1 } } });
      }
      for (const m of plan.milestones) await tx.milestone.update({ where: { id: m.id }, data: { dueDate: m.to } });
      if (plan.endDate) await tx.project.update({ where: { id: project.id }, data: { endDate: plan.endDate.to } });
      const closing = { resumedOn: today, resumedById: user.id, shiftDays: days };
      if (pause) await tx.projectPause.update({ where: { id: pause.id }, data: closing });
      else await tx.projectPause.create({ data: { projectId: project.id, pausedOn: null, reason: '', previousStatus, ...closing } });
      const current = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
      if (withBaseline && (await tx.baseline.count({ where: { projectId: project.id } })) > 0) {
        await createBaseline(tx, current, user.id, { reason: `Reanudación tras pausa: ${pause?.reason ?? ''}`.trim(), changeRequestId: null });
      }
      return current;
    });
    return c.json(toProjectDto(updated, true));
  });

  app.get('/api/projects/:id/pauses', async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await requirePmProject(c);
    const pauses = await prisma.projectPause.findMany({
      where: { projectId: project.id },
      include: { priorityProject: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(pauses.map((p) => ({ pausedOn: p.pausedOn, resumedOn: p.resumedOn, reason: p.reason, shiftDays: p.shiftDays, priorityProject: p.priorityProject })));
  });
}
