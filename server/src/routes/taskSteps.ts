import { stepSchema, updateStepSchema } from '@pm/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
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

export async function taskStepRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const assertAssigned = async (taskId: string, assigneeId?: string | null) => {
    if (!assigneeId) return;
    const assigned = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: assigneeId } } });
    if (!assigned) throw fieldError('assigneeId', 'La persona debe estar asignada a la tarea');
  };

  const findStep = async (taskId: string, stepId: string) => {
    const step = await prisma.taskStep.findFirst({ where: { id: stepId, taskId } });
    if (!step) throw notFound('Paso no encontrado');
    return step;
  };

  app.post<TaskParams>('/api/tasks/:id/steps', async (req, reply) => {
    const { task, isPm } = await getTaskAccess(req, req.params.id);
    if (!isPm) throw forbidden();
    const input = stepSchema.parse(req.body);
    await assertAssigned(task.id, input.assigneeId);
    const step = await prisma.$transaction(async (tx) => {
      const created = await tx.taskStep.create({ data: { taskId: task.id, title: input.title, assigneeId: input.assigneeId ?? null }, include: stepInclude });
      await syncProgress(tx, task.id, task.status === 'DONE' ? 'IN_PROGRESS' : undefined);
      return created;
    });
    return reply.status(201).send(toStepDto(step));
  });

  app.patch<StepParams>('/api/tasks/:id/steps/:stepId', async (req) => {
    const { task, isPm, isAssignee } = await getTaskAccess(req, req.params.id);
    const input = updateStepSchema.parse(req.body);
    const editsContent = input.title !== undefined || input.assigneeId !== undefined;
    if (editsContent && !isPm) throw forbidden();
    if (input.done !== undefined && !isPm && !isAssignee) throw forbidden('Solo puedes marcar los pasos de las tareas que tienes asignadas');
    const current = await findStep(task.id, req.params.stepId);
    await assertAssigned(task.id, input.assigneeId);

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
    return toStepDto(step);
  });

  app.delete<StepParams>('/api/tasks/:id/steps/:stepId', async (req) => {
    const { task, isPm } = await getTaskAccess(req, req.params.id);
    if (!isPm) throw forbidden();
    const step = await findStep(task.id, req.params.stepId);
    await prisma.$transaction(async (tx) => {
      await tx.taskStep.delete({ where: { id: step.id } });
      await syncProgress(tx, task.id);
    });
    return { ok: true };
  });
}
