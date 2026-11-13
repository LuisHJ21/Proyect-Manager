import type { PrismaClient } from '@prisma/client';
import {
  ACTIVE_PROJECT_STATUS,
  assigneesSchema,
  commentSchema,
  createTaskSchema,
  isDateOrderValid,
  TASK_DATE_ORDER_MESSAGE,
  taskProgressSchema,
  updateTaskSchema,
} from '@pm/shared';
import { readBody, type App, type Ctx } from '../http';
import { removeAfterDelete } from '../storage/fileStore';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { checkProgressChange } from '../domain/dependencies';
import { isWithinProject, outsideProjectMessage, type ProjectRange } from '../domain/projectDates';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { incidentAccess } from '../domain/incidents';
import { taskInclude, toTaskDto } from './taskDto';

type TaskParams = { Params: { id: string } };

export async function getTaskAccess(c: Ctx, taskId: string) {
  const user = requireUser(c);
  const { prisma } = c.var.deps;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound('Tarea no encontrada');
  const { isPm } = await getProjectAccess(c, task.projectId).catch(() => {
    throw notFound('Tarea no encontrada');
  });
  const assignee = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: user.id } } });
  return { task, isPm, isAssignee: Boolean(assignee) };
}

export function taskRoutes(app: App) {

  const loadDto = async (prisma: PrismaClient, taskId: string, includeCost: boolean) =>
    toTaskDto(await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }), includeCost);

  const requireTaskPm = async (c: Ctx, taskId: string) => {
    const { task, isPm } = await getTaskAccess(c, taskId);
    if (!isPm) throw forbidden();
    return task;
  };

  const assertDatesWithinProject = (project: ProjectRange, dates: { startDate?: string | null; dueDate?: string | null }) => {
    for (const field of ['startDate', 'dueDate'] as const) {
      const date = dates[field];
      if (date && !isWithinProject(date, project)) throw fieldError(field, outsideProjectMessage(project));
    }
  };

  const assertMilestone = async (prisma: PrismaClient, projectId: string, milestoneId?: string | null) => {
    if (!milestoneId) return;
    const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw fieldError('milestoneId', 'El hito debe pertenecer al proyecto');
  };

  /** Quien ya está asignado puede seguirlo aunque se haya desactivado; solo se valida a los nuevos. */
  const assertAssignable = async (prisma: PrismaClient, projectId: string, userIds: string[], field: string, taskId?: string) => {
    const unique = [...new Set(userIds)];
    const current = taskId ? await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } }) : [];
    const added = unique.filter((id) => !current.some((a) => a.userId === id));
    const count = await prisma.projectMember.count({
      where: { projectId, userId: { in: added }, user: { active: true, role: 'COLLABORATOR' } },
    });
    if (count !== added.length) throw fieldError(field, 'Solo se pueden asignar colaboradores activos del proyecto');
    return unique;
  };

  app.get('/api/projects/:id/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const { project, isPm } = await getProjectAccess(c, c.req.param('id'));
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: taskInclude,
      orderBy: { createdAt: 'asc' },
    });
    return c.json(tasks.map((task) => toTaskDto(task, isPm)));
  });

  app.post('/api/projects/:id/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const { assigneeIds, ...input } = createTaskSchema.parse(await readBody(c));
    assertDatesWithinProject(project, input);
    await assertMilestone(c.var.deps.prisma, project.id, input.milestoneId);
    const userIds = await assertAssignable(c.var.deps.prisma, project.id, assigneeIds, 'assigneeIds');
    const task = await prisma.task.create({
      data: { ...input, projectId: project.id, assignees: { create: userIds.map((userId) => ({ userId })) } },
      include: taskInclude,
    });
    return c.json(toTaskDto(task, true), 201);
  });

  app.get('/api/me/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const user = requireUser(c);
    const tasks = await prisma.task.findMany({
      where: { assignees: { some: { userId: user.id } }, project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } },
      include: { ...taskInclude, project: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return c.json(tasks.map(({ project, ...task }) => ({ ...toTaskDto(task, false), projectName: project.name })));
  });

  app.get('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm } = await getTaskAccess(c, c.req.param('id'));
    const viewer = { userId: requireUser(c).id, isPm };
    const incidents = (
      await prisma.incident.findMany({
        where: { taskId: task.id },
        select: { id: true, number: true, title: true, status: true, reportedById: true, ownerId: true },
        orderBy: { number: 'asc' },
      })
    )
      .filter((i) => incidentAccess(i, viewer).view)
      .map(({ id, number, title, status }) => ({ id, number, title, status }));
    const comments = await prisma.taskComment.findMany({
      where: { taskId: task.id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const steps = await prisma.taskStep.findMany({
      where: { taskId: task.id },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return c.json({
      ...(await loadDto(c.var.deps.prisma, task.id, isPm)),
      comments,
      steps: steps.map((s) => ({ id: s.id, title: s.title, done: s.done, assignee: s.assignee })),
      incidents,
    });
  });

  app.patch('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const { status: _status, progress: _progress, assigneeIds, ...input } = updateTaskSchema.parse(await readBody(c));
    const startDate = input.startDate === undefined ? task.startDate : input.startDate;
    const dueDate = input.dueDate === undefined ? task.dueDate : input.dueDate;
    if (!isDateOrderValid(startDate, dueDate)) throw fieldError('startDate', TASK_DATE_ORDER_MESSAGE);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
    assertDatesWithinProject(project, {
      startDate: input.startDate === task.startDate ? undefined : input.startDate,
      dueDate: input.dueDate === task.dueDate ? undefined : input.dueDate,
    });
    await assertMilestone(c.var.deps.prisma, task.projectId, input.milestoneId);
    const userIds = assigneeIds && (await assertAssignable(c.var.deps.prisma, task.projectId, assigneeIds, 'assigneeIds', task.id));
    await prisma.$transaction([
      prisma.task.update({ where: { id: task.id }, data: input }),
      ...(userIds
        ? [
            prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
            prisma.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId: task.id, userId })) }),
            prisma.taskStep.updateMany({ where: { taskId: task.id, assigneeId: { notIn: userIds } }, data: { assigneeId: null } }),
          ]
        : []),
    ]);
    return c.json(await loadDto(c.var.deps.prisma, task.id, true));
  });

  app.delete('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const attachments = await prisma.attachment.findMany({ where: { taskId: task.id }, select: { storedName: true } });
    await prisma.task.delete({ where: { id: task.id } });
    await removeAfterDelete(c.var.deps.files, attachments.map((a) => a.storedName));
    return c.json({ ok: true });
  });

  app.put('/api/tasks/:id/assignees', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const input = assigneesSchema.parse(await readBody(c));
    const userIds = await assertAssignable(c.var.deps.prisma, task.projectId, input.userIds, 'userIds', task.id);
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
      prisma.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId: task.id, userId })) }),
      prisma.taskStep.updateMany({ where: { taskId: task.id, assigneeId: { notIn: userIds } }, data: { assigneeId: null } }),
    ]);
    return c.json(await loadDto(c.var.deps.prisma, task.id, true));
  });

  app.patch('/api/tasks/:id/progress', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm && !isAssignee) throw forbidden('Solo puedes actualizar las tareas que tienes asignadas');
    const input = taskProgressSchema.parse(await readBody(c));
    const data = input.status === 'DONE' ? { ...input, progress: 100 } : input;

    await prisma.$transaction(async (tx) => {
      const current = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
      const steps = await tx.taskStep.findMany({ where: { taskId: task.id }, select: { done: true } });
      if (steps.length > 0 && input.progress !== undefined) {
        throw fieldError('progress', 'El avance de una tarea con pasos se calcula con ellos');
      }
      const pendingSteps = steps.filter((step) => !step.done).length;
      if (input.status === 'DONE' && pendingSteps > 0) {
        throw new AppError(409, 'steps_pending', pendingSteps === 1 ? 'Falta 1 paso por completar' : `Faltan ${pendingSteps} pasos por completar`, {
          details: { pending: pendingSteps },
        });
      }
      const pending = await tx.taskDependency.findMany({
        where: { successorId: task.id, predecessor: { status: { not: 'DONE' } } },
        include: { predecessor: { select: { id: true, title: true } } },
      });
      if (checkProgressChange(current, data, pending.length) === 'blocked') {
        const titles = pending.map((d) => d.predecessor.title).join(', ');
        throw new AppError(409, 'predecessors_pending', `Antes deben terminar: ${titles}`, {
          details: { pending: pending.map((d) => d.predecessor) },
        });
      }
      await tx.task.update({ where: { id: task.id }, data });
    });
    return c.json(await loadDto(c.var.deps.prisma, task.id, isPm));
  });

  app.post('/api/tasks/:id/comments', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm && !isAssignee) throw forbidden('Solo puedes comentar las tareas que tienes asignadas');
    const { body } = commentSchema.parse(await readBody(c));
    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: requireUser(c).id, body },
      include: { author: { select: { id: true, name: true } } },
    });
    return c.json(comment, 201);
  });
}
