import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ACTIVE_PROJECT_STATUS,
  type DependencyType,
  assigneesSchema,
  commentSchema,
  createTaskSchema,
  isDateOrderValid,
  TASK_DATE_ORDER_MESSAGE,
  taskProgressSchema,
  updateTaskSchema,
  moveTaskSchema,
} from '@pm/shared';
import { readBody, type App, type Ctx } from '../http';
import { queueFileDeletion, removeAfterDelete } from '../storage/fileStore';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { checkProgressChange, isBlocking } from '../domain/dependencies';
import { assertDependencyDate, assertTaskDependencyDates } from '../domain/dependencyDates';
import { isWithinProject, outsideProjectMessage, type ProjectRange } from '../domain/projectDates';
import { AppError, editConflict, fieldError, forbidden, notFound } from '../errors';
import { incidentAccess } from '../domain/incidents';
import { notify } from '../notifications';
import { taskInclude, toTaskDto } from './taskDto';
import { assertChildrenWithinWindow, assertDeliverable, assertNotSummary, assertParent, assertParentDates, becomeSummary, inWbsOrder, isSummaryTask, loadTree, loadTrees, moveTask, nextPosition, SUMMARY_FIELD_MESSAGE } from './taskTree';
import { leafWhere } from '../domain/wbs';

type TaskParams = { Params: { id: string } };

/** Avisa a quienes pasan a ser responsables de la tarea (no a los que ya lo eran). */
export async function notifyNewAssignees(c: Ctx, task: { id: string; projectId: string; title: string }, before: string[], after: string[]) {
  const added = after.filter((id) => !before.includes(id));
  await notify(c.var.deps.prisma, { kind: 'TASK_ASSIGNED', projectId: task.projectId, entityId: task.id, title: task.title, userIds: added, actorId: requireUser(c).id });
}

const assigneeIdsOf = async (prisma: PrismaClient, taskId: string) =>
  (await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } })).map((a) => a.userId);

export const assertDatesWithinProject = (project: ProjectRange, dates: { startDate?: string | null; dueDate?: string | null }) => {
  for (const field of ['startDate', 'dueDate'] as const) {
    const date = dates[field];
    if (date && !isWithinProject(date, project)) throw fieldError(field, outsideProjectMessage(project));
  }
};

/** Quien ya está asignado puede seguirlo aunque se haya desactivado; solo se valida a los nuevos. */
export const assertAssignable = async (prisma: PrismaClient, projectId: string, userIds: string[], field: string, taskId?: string) => {
  const unique = [...new Set(userIds)];
  const current = taskId ? await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } }) : [];
  const added = unique.filter((id) => !current.some((a) => a.userId === id));
  const count = await prisma.projectMember.count({
    where: { projectId, userId: { in: added }, user: { active: true, role: { in: ['PM', 'COLLABORATOR'] } } },
  });
  if (count !== added.length) throw fieldError(field, 'Solo se pueden asignar miembros activos del proyecto');
  return unique;
};

export async function getTaskAccess(c: Ctx, taskId: string) {
  const user = requireUser(c);
  const { prisma } = c.var.deps;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound('Tarea no encontrada');
  const { isPm, can } = await getProjectAccess(c, task.projectId).catch(() => {
    throw notFound('Tarea no encontrada');
  });
  const assignee = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: user.id } } });
  return { task, isPm, can, isAssignee: Boolean(assignee) };
}

/** Reemplaza los responsables de la tarea. */
async function replaceAssignees(tx: Prisma.TransactionClient, taskId: string, userIds: string[]) {
  await tx.taskAssignee.deleteMany({ where: { taskId } });
  await tx.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId, userId })) });
}

export function taskRoutes(app: App) {

  const loadDto = async (prisma: PrismaClient, taskId: string, includeCost: boolean) => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(task, includeCost, await loadTree(prisma, task.projectId));
  };

  /** Todas las tareas del proyecto en orden EDT. */
  const listDtos = async (prisma: PrismaClient, projectId: string, includeCost: boolean) => {
    const [tasks, tree] = await Promise.all([prisma.task.findMany({ where: { projectId }, include: taskInclude }), loadTree(prisma, projectId)]);
    return inWbsOrder(tasks, tree).map((task) => toTaskDto(task, includeCost, tree));
  };

  const requireTaskPm = async (c: Ctx, taskId: string) => {
    const { task, isPm } = await getTaskAccess(c, taskId);
    if (!isPm) throw forbidden();
    return task;
  };

  const assertMilestone = async (prisma: PrismaClient, projectId: string, milestoneId?: string | null) => {
    if (!milestoneId) return;
    const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!milestone) throw fieldError('milestoneId', 'El hito debe pertenecer al proyecto');
  };

  app.get('/api/projects/:id/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const { project, isPm, role } = await getProjectAccess(c, c.req.param('id'));
    const list = await listDtos(prisma, project.id, isPm);
    return c.json(role === 'COLLABORATOR' ? list.filter((task) => task.assignees.some((person) => person.id === requireUser(c).id)) : list);
  });

  app.post('/api/projects/:id/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'tasks', 'write');
    const { assigneeIds, predecessorIds, ...input } = createTaskSchema.parse(await readBody(c));
    assertDatesWithinProject(project, input);
    await assertMilestone(c.var.deps.prisma, project.id, input.milestoneId);
    const userIds = await assertAssignable(c.var.deps.prisma, project.id, assigneeIds, 'assigneeIds');
    await assertParent(prisma, { projectId: project.id }, input.parentId);
    await assertParentDates(prisma, input.parentId, { startDate: input.startDate ?? null, dueDate: input.dueDate ?? null });
    await assertDeliverable(prisma, project.id, input.deliverableId);
    const uniquePredecessors = [...new Set(predecessorIds)];
    const predecessors = await prisma.task.findMany({ where: { id: { in: uniquePredecessors }, projectId: project.id }, select: { id: true, title: true, startDate: true, dueDate: true } });
    if (predecessors.length !== uniquePredecessors.length) throw fieldError('predecessorIds', 'Selecciona tareas del mismo proyecto');
    for (const predecessor of predecessors) {
      await assertNotSummary(prisma, predecessor.id);
      assertDependencyDate('FS', 0, predecessor, { startDate: input.startDate ?? null, dueDate: input.dueDate ?? null }, predecessor.title, 'startDate');
    }
    const task = await prisma.$transaction(async (tx) => {
      const position = await nextPosition(tx, project.id, input.parentId ?? null);
      const created = await tx.task.create({
        data: { ...input, position, projectId: project.id, assignees: { create: userIds.map((userId) => ({ userId })) } },
        include: taskInclude,
      });
      if (uniquePredecessors.length) await tx.taskDependency.createMany({ data: uniquePredecessors.map((predecessorId) => ({ predecessorId, successorId: created.id })) });
      await becomeSummary(tx, input.parentId);
      return created;
    });
    await notifyNewAssignees(c, task, [], userIds);
    return c.json(await loadDto(prisma, task.id, true), 201);
  });

  app.get('/api/me/tasks', async (c) => {
    const { prisma } = c.var.deps;
    const user = requireUser(c);
    // El observador no ejecuta tareas: su lista siempre está vacía.
    if (user.role === 'OBSERVER') return c.json([]);
    const tasks = await prisma.task.findMany({
      where: { ...leafWhere, assignees: { some: { userId: user.id } }, project: { status: { in: [...ACTIVE_PROJECT_STATUS] } } },
      include: { ...taskInclude, project: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const trees = await loadTrees(prisma, tasks.map((t) => t.projectId));
    return c.json(tasks.map(({ project, ...task }) => ({ ...toTaskDto(task, false, trees.get(task.projectId)!), projectName: project.name })));
  });

  app.get('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, can, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (requireUser(c).role === 'COLLABORATOR' && !isAssignee) throw notFound('Tarea no encontrada');
    const viewer = { userId: requireUser(c).id, isPm };
    // Sin permiso de incidentes (observador) no se envía ninguno, aunque la persona los haya reportado antes.
    const incidents = !can.read('incidents') ? [] : (
      await prisma.incident.findMany({
        where: { taskId: task.id },
        select: { id: true, number: true, title: true, status: true, reportedById: true, ownerId: true },
        orderBy: { number: 'asc' },
      })
    )
      .filter((i) => incidentAccess(i, viewer).view)
      .map(({ id, number, title, status }) => ({ id, number, title, status }));
    // El observador no lee la conversación de la tarea.
    const comments = !can.read('comments') ? null : await prisma.taskComment.findMany({
      where: { taskId: task.id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const steps = await prisma.taskStep.findMany({
      where: { taskId: task.id },
      include: { completedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const tree = await loadTree(prisma, task.projectId);
    const titles = new Map((await prisma.task.findMany({ where: { projectId: task.projectId }, select: { id: true, title: true } })).map((t) => [t.id, t.title]));
    const ref = (id: string) => ({ id, title: titles.get(id)!, wbsCode: tree.nodes.get(id)!.code });
    const node = tree.nodes.get(task.id)!;
    return c.json({
      ...(await loadDto(c.var.deps.prisma, task.id, isPm)),
      ancestors: node.ancestorIds.map(ref),
      children: node.childIds.map(ref),
      ...(comments ? { comments } : {}),
      steps: steps.map((s) => ({ id: s.id, title: s.title, done: s.done, completedBy: s.completedBy })),
      incidents,
    });
  });

  app.patch('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const { status: _status, progress: _progress, assigneeIds, version, ...input } = updateTaskSchema.parse(await readBody(c));
    const isSummary = await isSummaryTask(prisma, task.id);
    if (isSummary) {
      // Una padre no tiene trabajo propio: estos campos salen de sus subtareas.
      const own: [string, boolean][] = [
        ['assigneeIds', (assigneeIds?.length ?? 0) > 0],
        ['plannedCostCents', (input.plannedCostCents ?? 0) > 0],
        ['estimatedHours', (input.estimatedHours ?? 0) > 0],
      ];
      const field = own.find(([, present]) => present)?.[0];
      if (field) throw fieldError(field, SUMMARY_FIELD_MESSAGE);
    }
    const startDate = input.startDate === undefined ? task.startDate : input.startDate;
    const dueDate = input.dueDate === undefined ? task.dueDate : input.dueDate;
    if (!isDateOrderValid(startDate, dueDate)) throw fieldError('startDate', TASK_DATE_ORDER_MESSAGE);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: task.projectId } });
    assertDatesWithinProject(project, {
      startDate: input.startDate === task.startDate ? undefined : input.startDate,
      dueDate: input.dueDate === task.dueDate ? undefined : input.dueDate,
    });
    if (startDate !== task.startDate || dueDate !== task.dueDate) await assertTaskDependencyDates(prisma, task.id, { startDate, dueDate });
    await assertMilestone(c.var.deps.prisma, task.projectId, input.milestoneId);
    const userIds = assigneeIds && (await assertAssignable(c.var.deps.prisma, task.projectId, assigneeIds, 'assigneeIds', task.id));
    const before = userIds ? await assigneeIdsOf(prisma, task.id) : [];
    const parentChanged = input.parentId !== undefined && input.parentId !== task.parentId;
    if (parentChanged) await assertParent(prisma, task, input.parentId);
    if (parentChanged || startDate !== task.startDate || dueDate !== task.dueDate) {
      const nextParentId = input.parentId === undefined ? task.parentId : input.parentId;
      await assertParentDates(prisma, nextParentId, { startDate, dueDate });
      if (isSummary) await assertChildrenWithinWindow(prisma, task.id, { startDate, dueDate });
      if (isSummary && parentChanged) {
        const tree = await loadTree(prisma, task.projectId);
        for (const [id, node] of tree.nodes) {
          if (!node.ancestorIds.includes(task.id)) continue;
          const descendant = tree.byId.get(id)!;
          await assertParentDates(prisma, nextParentId, { startDate: descendant.startDate, dueDate: descendant.dueDate });
        }
      }
    }
    await assertDeliverable(prisma, task.projectId, input.deliverableId);
    await prisma.$transaction(async (tx) => {
      // Al cambiar de padre, la tarea queda al final de sus nuevas hermanas.
      const position = parentChanged ? { position: await nextPosition(tx, task.projectId, input.parentId ?? null) } : {};
      const { count } = await tx.task.updateMany({ where: { id: task.id, version }, data: { ...input, ...position, version: { increment: 1 } } });
      if (count === 0) throw editConflict();
      if (parentChanged) await becomeSummary(tx, input.parentId);
      if (userIds) await replaceAssignees(tx, task.id, userIds);
    });
    if (userIds) await notifyNewAssignees(c, { ...task, title: input.title ?? task.title }, before, userIds);
    return c.json(await loadDto(c.var.deps.prisma, task.id, true));
  });

  app.delete('/api/tasks/:id', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    if ((await prisma.task.count({ where: { parentId: task.id } })) > 0) {
      throw new AppError(409, 'task_has_children', 'Mueve o borra primero sus subtareas');
    }
    const attachments = await prisma.attachment.findMany({ where: { taskId: task.id }, select: { storedName: true } });
    const storedNames = attachments.map((a) => a.storedName);
    await prisma.$transaction(async (tx) => {
      await queueFileDeletion(tx, storedNames);
      await tx.task.delete({ where: { id: task.id } });
    });
    await removeAfterDelete(prisma, c.var.deps.files, storedNames);
    return c.json({ ok: true });
  });

  /** Sube o baja la tarea entre sus hermanas y devuelve la lista del proyecto. */
  app.post('/api/tasks/:id/move', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const move = moveTaskSchema.parse(await readBody(c));
    await prisma.$transaction((tx) => moveTask(tx, task.id, 'direction' in move ? move.direction : { targetId: move.targetId }));
    return c.json(await listDtos(prisma, task.projectId, true));
  });

  app.put('/api/tasks/:id/assignees', async (c) => {
    const { prisma } = c.var.deps;
    const task = await requireTaskPm(c, c.req.param('id'));
    const input = assigneesSchema.parse(await readBody(c));
    if (input.userIds.length > 0 && (await isSummaryTask(prisma, task.id))) throw fieldError('userIds', SUMMARY_FIELD_MESSAGE);
    const userIds = await assertAssignable(c.var.deps.prisma, task.projectId, input.userIds, 'userIds', task.id);
    const before = await assigneeIdsOf(prisma, task.id);
    await prisma.$transaction(async (tx) => {
      await replaceAssignees(tx, task.id, userIds);
      await tx.task.update({ where: { id: task.id }, data: { version: { increment: 1 } } });
    });
    await notifyNewAssignees(c, task, before, userIds);
    return c.json(await loadDto(c.var.deps.prisma, task.id, true));
  });

  app.patch('/api/tasks/:id/progress', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm && !isAssignee) throw forbidden('Solo puedes actualizar las tareas que tienes asignadas');
    await assertNotSummary(prisma, task.id);
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
      // Solo bloquean una fin a inicio sin terminar y una inicio a inicio sin empezar.
      const pending = (
        await tx.taskDependency.findMany({
          where: { successorId: task.id, predecessor: { status: { not: 'DONE' } } },
          include: { predecessor: { select: { id: true, title: true, status: true } } },
        })
      ).filter((d) => isBlocking(d.type, d.predecessor.status));
      const blocking = pending.map((d) => ({ type: d.type as DependencyType, status: d.predecessor.status }));
      if (checkProgressChange(current, data, blocking) === 'blocked') {
        const titles = pending.map((d) => d.predecessor.title).join(', ');
        throw new AppError(409, 'predecessors_pending', `Antes deben terminar: ${titles}`, {
          details: { pending: pending.map((d) => ({ id: d.predecessor.id, title: d.predecessor.title })) },
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
    await notify(prisma, {
      kind: 'TASK_COMMENTED',
      projectId: task.projectId,
      entityId: task.id,
      title: task.title,
      userIds: () => assigneeIdsOf(prisma, task.id),
      actorId: comment.author.id,
      actorName: comment.author.name,
    });
    return c.json(comment, 201);
  });
}
