import { dependencySchema } from '@pm/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { findDependencyCycle } from '../domain/dependencies';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { taskInclude, toTaskDto } from './taskDto';
import { getTaskAccess } from './tasks';

type Params = { Params: { id: string; predecessorId: string } };

export async function dependencyRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const requireTaskPm = async (req: FastifyRequest, taskId: string) => {
    const { task, isPm } = await getTaskAccess(req, taskId);
    if (!isPm) throw forbidden();
    return task;
  };
  const loadDto = async (taskId: string) =>
    toTaskDto(await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));

  app.post<{ Params: { id: string } }>('/api/tasks/:id/dependencies', async (req, reply) => {
    const successor = await requireTaskPm(req, req.params.id);
    const { predecessorId } = dependencySchema.parse(req.body);

    const tasks = await prisma.task.findMany({ where: { projectId: successor.projectId }, select: { id: true, title: true } });
    const titles = new Map(tasks.map((t) => [t.id, t.title]));
    if (!titles.has(predecessorId)) throw fieldError('predecessorId', 'La predecesora debe pertenecer al mismo proyecto');

    const edges = await prisma.taskDependency.findMany({ where: { successor: { projectId: successor.projectId } } });
    if (edges.some((e) => e.predecessorId === predecessorId && e.successorId === successor.id)) {
      throw new AppError(409, 'dependency_exists', 'Esta dependencia ya existe');
    }

    const cycle = findDependencyCycle(edges, predecessorId, successor.id);
    if (cycle) {
      const chain = cycle.map((id) => ({ id, title: titles.get(id) ?? '' }));
      throw new AppError(
        409,
        'dependency_cycle',
        `Esta dependencia crearía un ciclo: ${chain.map((t) => t.title).join(' → ')}`,
        { details: { chain } },
      );
    }

    await prisma.taskDependency.create({ data: { predecessorId, successorId: successor.id } });
    return reply.status(201).send(await loadDto(successor.id));
  });

  app.delete<Params>('/api/tasks/:id/dependencies/:predecessorId', async (req) => {
    const successor = await requireTaskPm(req, req.params.id);
    const where = { predecessorId_successorId: { predecessorId: req.params.predecessorId, successorId: successor.id } };
    if (!(await prisma.taskDependency.findUnique({ where }))) throw notFound('Dependencia no encontrada');
    await prisma.taskDependency.delete({ where });
    return loadDto(successor.id);
  });
}
