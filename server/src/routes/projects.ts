import { createProjectSchema, DATE_ORDER_MESSAGE, deleteProjectSchema, isDateOrderValid, updateProjectSchema } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectPm, toProjectDto } from '../auth/access';
import { requirePm, requireUser } from '../auth/guards';
import { countTasksOutside, type ProjectRange } from '../domain/projectDates';
import { fieldError } from '../errors';
import { sanitizeFields } from '../richText';
import { removeStoredFiles } from '../files';
import { loadProjectSummaries } from './projectStats';

export function projectRoutes(app: App) {

  /** Solo comprueba los límites que cambian, y solo las tareas que hoy están dentro: las que ya estaban fuera no impiden editar. */
  const assertTasksStayInside = async (prisma: PrismaClient, project: ProjectRange & { id: string }, changed: ProjectRange) => {
    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, select: { startDate: true, dueDate: true } });
    for (const field of ['startDate', 'endDate'] as const) {
      if (!changed[field]) continue;
      const limit = (value: string | null): ProjectRange => ({ startDate: null, endDate: null, [field]: value });
      const inside = tasks.filter((task) => countTasksOutside([task], limit(project[field])) === 0);
      const count = countTasksOutside(inside, limit(changed[field]));
      if (count > 0) {
        const tasksText = count === 1 ? '1 tarea quedaría' : `${count} tareas quedarían`;
        throw fieldError(field, `${tasksText} fuera del proyecto. Ajusta sus fechas primero.`);
      }
    }
  };

  app.get('/api/projects', async (c) => {
    const { prisma } = c.var.deps;
    const user = requireUser(c);
    const isPm = user.role === 'PM';
    const projects = await prisma.project.findMany({
      where: isPm ? {} : { members: { some: { userId: user.id } } },
      include: { members: { include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } } },
      orderBy: { name: 'asc' },
    });
    const averages = await prisma.task.groupBy({ by: ['projectId'], _avg: { progress: true } });
    const progressById = new Map(averages.map((a) => [a.projectId, Math.round(a._avg.progress ?? 0)]));
    const summaries = isPm ? await loadProjectSummaries(prisma, projects, c.var.deps.today()) : null;
    return c.json(projects.map(({ members, ...project }) => {
      const summary = summaries?.get(project.id);
      return {
        ...toProjectDto(project, isPm),
        progress: progressById.get(project.id) ?? 0,
        team: members.map((m) => m.user),
        ...(summary
          ? { health: summary.health, overdueTasks: summary.overdueTasks, highRisks: summary.highRisks, spentCents: summary.spentCents }
          : {}),
      };
    }));
  });

  app.post('/api/projects', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const input = createProjectSchema.parse(sanitizeFields(await readBody(c), ['description']));
    const project = await prisma.project.create({ data: { ...input, charter: { create: {} } } });
    return c.json(toProjectDto(project, true), 201);
  });

  app.get('/api/projects/:id', async (c) => {
    const { project, isPm } = await getProjectAccess(c, c.req.param('id'));
    return c.json(toProjectDto(project, isPm));
  });

  app.patch('/api/projects/:id', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const input = updateProjectSchema.parse(sanitizeFields(await readBody(c), ['description']));
    const startDate = input.startDate === undefined ? project.startDate : input.startDate;
    const endDate = input.endDate === undefined ? project.endDate : input.endDate;
    if (!isDateOrderValid(startDate, endDate)) throw fieldError('startDate', DATE_ORDER_MESSAGE);
    await assertTasksStayInside(prisma, project, { startDate: startDate === project.startDate ? null : startDate, endDate: endDate === project.endDate ? null : endDate });
    const updated = await prisma.project.update({ where: { id: project.id }, data: input });
    return c.json(toProjectDto(updated, true));
  });

  app.delete('/api/projects/:id', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const { confirmName } = deleteProjectSchema.parse(await readBody(c));
    if (confirmName !== project.name) {
      throw fieldError('confirmName', 'Escribe el nombre exacto del proyecto para confirmar');
    }
    const attachments = await prisma.attachment.findMany({ where: { projectId: project.id }, select: { storedName: true } });
    await prisma.project.delete({ where: { id: project.id } });
    await removeStoredFiles(c.var.deps.dataDir, attachments.map((a) => a.storedName));
    return c.json({ ok: true });
  });
}
