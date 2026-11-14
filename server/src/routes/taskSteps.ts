import { stepSchema, updateStepSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { stepProgress } from '../domain/taskSteps';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { getTaskAccess } from './tasks';

type TaskParams = { Params: { id: string } };
type StepParams = { Params: { id: string; stepId: string } };

const stepInclude = { assignee: { select: { id: true, name: true } } };

const toStepDto = (step: { id: string; title: string; done: boolean; assignee: { id: string; name: string } | null }) => ({
  id: step.id,
  title: step.title,
  done: step.done,
  assignee: step.assignee,
});

/** Recalcula el avance. Sin pasos, la tarea conserva el último valor. */
async function syncProgress(tx: Prisma.TransactionClient, taskId: string, status?: string) {
  const steps = await tx.taskStep.findMany({ where: { taskId }, select: { done: true } });
  const progress = stepProgress(steps);
  await tx.task.update({
    where: { id: taskId },
    data: { ...(progress === null ? {} : { progress }), ...(status ? { status } : {}) },
  });
}

export function taskStepRoutes(app: App) {

  const assertAssigned = async (prisma: PrismaClient, taskId: string, assigneeId?: string | null) => {
    if (!assigneeId) return;
    const assigned = await prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId, userId: assigneeId } },
      include: { user: { select: { role: true } } },
    });
    if (!assigned) throw fieldError('assigneeId', 'La persona debe estar asignada a la tarea');
    // Quien pasó a Observador puede seguir en una tarea antigua, pero no recibe trabajo nuevo.
    if (assigned.user.role === 'OBSERVER') throw fieldError('assigneeId', 'Un observador no puede tener pasos asignados');
  };

  const findStep = async (prisma: PrismaClient, taskId: string, stepId: string) => {
    const step = await prisma.taskStep.findFirst({ where: { id: stepId, taskId } });
    if (!step) throw notFound('Paso no encontrado');
    return step;
  };

  app.post('/api/tasks/:id/steps', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm) throw forbidden();
    const input = stepSchema.parse(await readBody(c));
    await assertAssigned(c.var.deps.prisma, task.id, input.assigneeId);
    const step = await prisma.$transaction(async (tx) => {
      const created = await tx.taskStep.create({ data: { taskId: task.id, title: input.title, assigneeId: input.assigneeId ?? null }, include: stepInclude });
      await syncProgress(tx, task.id, task.status === 'DONE' ? 'IN_PROGRESS' : undefined);
      return created;
    });
    return c.json(toStepDto(step), 201);
  });

  app.patch('/api/tasks/:id/steps/:stepId', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    const input = updateStepSchema.parse(await readBody(c));
    const editsContent = input.title !== undefined || input.assigneeId !== undefined;
    if (editsContent && !isPm) throw forbidden();
    if (input.done !== undefined && !isPm && !isAssignee) throw forbidden('Solo puedes marcar los pasos de las tareas que tienes asignadas');
    const current = await findStep(c.var.deps.prisma, task.id, c.req.param('stepId'));
    await assertAssigned(c.var.deps.prisma, task.id, input.assigneeId);

    const step = await prisma.$transaction(async (tx) => {
      const marking = input.done === true && !current.done;
      const unmarking = input.done === false && current.done;
      if (marking) {
        const pending = await tx.taskDependency.findMany({
          where: { successorId: task.id, predecessor: { status: { not: 'DONE' } } },
          include: { predecessor: { select: { id: true, title: true } } },
        });
        if (pending.length > 0) {
          const titles = pending.map((d) => d.predecessor.title).join(', ');
          throw new AppError(409, 'predecessors_pending', `Antes deben terminar: ${titles}`, {
            details: { pending: pending.map((d) => d.predecessor) },
          });
        }
      }
      const updated = await tx.taskStep.update({ where: { id: current.id }, data: input, include: stepInclude });
      const fresh = await tx.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } });
      const status = marking && fresh.status === 'TODO' ? 'IN_PROGRESS' : unmarking && fresh.status === 'DONE' ? 'IN_PROGRESS' : undefined;
      await syncProgress(tx, task.id, status);
      return updated;
    });
    return c.json(toStepDto(step));
  });

  app.delete('/api/tasks/:id/steps/:stepId', async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm) throw forbidden();
    const step = await findStep(c.var.deps.prisma, task.id, c.req.param('stepId'));
    await prisma.$transaction(async (tx) => {
      await tx.taskStep.delete({ where: { id: step.id } });
      await syncProgress(tx, task.id);
    });
    return c.json({ ok: true });
  });
}
