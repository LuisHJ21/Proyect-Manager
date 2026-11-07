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
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { checkProgressChange } from '../domain/dependencies';
import { isWithinProject, outsideProjectMessage, type ProjectRange } from '../domain/projectDates';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { removeStoredFiles } from '../files';
import { taskInclude, toTaskDto } from './taskDto';

type TaskParams = { Params: { id: string } };

export async function getTaskAccess(req: FastifyRequest, taskId: string) {
  const user = requireUser(req);
  const { prisma } = req.server;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound('Tarea no encontrada');
  const { isPm } = await getProjectAccess(req, task.projectId).catch(() => {
    throw notFound('Tarea no encontrada');
  });
  const assignee = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: user.id } } });
  return { task, isPm, isAssignee: Boolean(assignee) };
}

export async function taskRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const loadDto = async (taskId: string) =>
    toTaskDto(await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));

  const requireTaskPm = async (req: FastifyRequest, taskId: string) => {
    const { task, isPm } = await getTaskAccess(req, taskId);
    if (!isPm) throw forbidden();
    return task;
  };

  const assertDatesWithinProject = (project: ProjectRange, dates: { startDate?: string | null; dueDate?: string | null }) => {
    for (const field of ['startDate', 'dueDate'] as const) {
      const date = dates[field];
      if (date && !isWithinProject(date, project)) throw fieldError(field, outsideProjectMessage(project));
    }
  };

  const assertMilestone = async (projectId: string, milestoneId?: string | null) => {
    if (!milestoneId) return;
    const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw fieldError('milestoneId', 'El hito debe pertenecer al proyecto');
  };

  /** Quien ya está asignado puede seguirlo aunque se haya desactivado; solo se valida a los nuevos. */
  const assertAssignable = async (projectId: string, userIds: string[], field: string, taskId?: string) => {
    const unique = [...new Set(userIds)];
    const current = taskId ? await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } }) : [];
    const added = unique.filter((id) => !current.some((a) => a.userId === id));
    const count = await prisma.projectMember.count({
      where: { projectId, userId: { in: added }, user: { active: true, role: 'COLLABORATOR' } },
    });
    if (count !== added.length) throw fieldError(field, 'Solo se pueden asignar colaboradores activos del proyecto');
    return unique;
  };

  app.get<TaskParams>('/api/projects/:id/tasks', async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: taskInclude,
      orderBy: { createdAt: 'asc' },
    });
    return tasks.map(toTaskDto);
  });

  app.post<TaskParams>('/api/projects/:id/tasks', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const { assigneeIds, ...input } = createTaskSchema.parse(req.body);
    assertDatesWithinProject(project, input);
    await assertMilestone(project.id, input.milestoneId);
    const userIds = await assertAssignable(project.id, assigneeIds, 'assigneeIds');
    const task = await prisma.task.create({
      data: { ...input, projectId: project.id, assignees: { create: userIds.map((userId) => ({ userId })) } },
      include: taskInclude,
    });
    return reply.status(201).send(toTaskDto(task));
  });

  app.get('/api/me/tasks', async (req) => {
    const user = requireUser(req);
    const tasks = await prisma.task.findMany({
      where: { assignees: { some: { userId: user.id } }, project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } },
      include: { ...taskInclude, project: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return tasks.map(({ project, ...task }) => ({ ...toTaskDto(task), projectName: project.name }));
  });

  app.get<TaskParams>('/api/tasks/:id', async (req) => {
    const { task } = await getTaskAccess(req, req.params.id);
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
    return {
      ...(await loadDto(task.id)),
      comments,
      steps: steps.map((s) => ({ id: s.id, title: s.title, done: s.done, assignee: s.assignee })),
    };
  });

  app.patch<TaskParams>('/api/tasks/:id', async (req) => {
    const task = await requireTaskPm(req, req.params.id);
    const { status: _status, progress: _progress, assigneeIds, ...input } = updateTaskSchema.parse(req.body);
    const startDate = input.startDate === undefined ? task.startDate : input.startDate;
    const dueDate = input.dueDate === undefined ? task.dueDate : input.dueDate;
    if (!isDateOrderValid(startDate, dueDate)) throw fieldError('startDate', TASK_DATE_ORDER_MESSAGE);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
    assertDatesWithinProject(project, {
      startDate: input.startDate === task.startDate ? undefined : input.startDate,
      dueDate: input.dueDate === task.dueDate ? undefined : input.dueDate,
    });
    await assertMilestone(task.projectId, input.milestoneId);
    const userIds = assigneeIds && (await assertAssignable(task.projectId, assigneeIds, 'assigneeIds', task.id));
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
    return loadDto(task.id);
  });

  app.delete<TaskParams>('/api/tasks/:id', async (req) => {
    const task = await requireTaskPm(req, req.params.id);
    const attachments = await prisma.attachment.findMany({ where: { taskId: task.id }, select: { storedName: true } });
    await prisma.task.delete({ where: { id: task.id } });
    await removeStoredFiles(app.dataDir, attachments.map((a) => a.storedName));
    return { ok: true };
  });

  app.put<TaskParams>('/api/tasks/:id/assignees', async (req) => {
    const task = await requireTaskPm(req, req.params.id);
    const input = assigneesSchema.parse(req.body);
    const userIds = await assertAssignable(task.projectId, input.userIds, 'userIds', task.id);
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: task.id } }),
      prisma.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId: task.id, userId })) }),
      prisma.taskStep.updateMany({ where: { taskId: task.id, assigneeId: { notIn: userIds } }, data: { assigneeId: null } }),
    ]);
    return loadDto(task.id);
  });

  app.patch<TaskParams>('/api/tasks/:id/progress', async (req) => {
    const { task, isPm, isAssignee } = await getTaskAccess(req, req.params.id);
    if (!isPm && !isAssignee) throw forbidden('Solo puedes actualizar las tareas que tienes asignadas');
    const input = taskProgressSchema.parse(req.body);
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
    return loadDto(task.id);
  });

  app.post<TaskParams>('/api/tasks/:id/comments', async (req, reply) => {
    const { task, isPm, isAssignee } = await getTaskAccess(req, req.params.id);
    if (!isPm && !isAssignee) throw forbidden('Solo puedes comentar las tareas que tienes asignadas');
    const { body } = commentSchema.parse(req.body);
    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: requireUser(req).id, body },
      include: { author: { select: { id: true, name: true } } },
    });
    return reply.status(201).send(comment);
  });
}
