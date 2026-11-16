import type { PrismaClient } from '@prisma/client';
import { dependencySchema, updateDependencySchema } from '@pm/shared';
import { readBody, type App, type Ctx } from '../http';
import { findDependencyCycle } from '../domain/dependencies';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { taskInclude, toTaskDto } from './taskDto';
import { getTaskAccess } from './tasks';
import { assertNotSummary, loadTree } from './taskTree';

type Params = { Params: { id: string; predecessorId: string } };

export function dependencyRoutes(app: App) {

  const requireTaskPm = async (c: Ctx, taskId: string) => {
    const { task, isPm } = await getTaskAccess(c, taskId);
    if (!isPm) throw forbidden();
    return task;
  };
  const loadDto = async (prisma: PrismaClient, taskId: string) => {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(task, true, await loadTree(prisma, task.projectId));
  };

  app.post('/api/tasks/:id/dependencies', async (c) => {
    const { prisma } = c.var.deps;
    const successor = await requireTaskPm(c, c.req.param('id'));
    const { predecessorId, type, lagDays } = dependencySchema.parse(await readBody(c));
    await assertNotSummary(prisma, successor.id);
    await assertNotSummary(prisma, predecessorId);

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

    await prisma.taskDependency.create({ data: { predecessorId, successorId: successor.id, type, lagDays } });
    return c.json(await loadDto(c.var.deps.prisma, successor.id), 201);
  });

  app.patch('/api/tasks/:id/dependencies/:predecessorId', async (c) => {
    const { prisma } = c.var.deps;
    const successor = await requireTaskPm(c, c.req.param('id'));
    const where = { predecessorId_successorId: { predecessorId: c.req.param('predecessorId'), successorId: successor.id } };
    if (!(await prisma.taskDependency.findUnique({ where }))) throw notFound('Dependencia no encontrada');
    const input = updateDependencySchema.parse(await readBody(c));
    await prisma.taskDependency.update({ where, data: input });
    return c.json(await loadDto(c.var.deps.prisma, successor.id));
  });

  app.delete('/api/tasks/:id/dependencies/:predecessorId', async (c) => {
    const { prisma } = c.var.deps;
    const successor = await requireTaskPm(c, c.req.param('id'));
    const where = { predecessorId_successorId: { predecessorId: c.req.param('predecessorId'), successorId: successor.id } };
    if (!(await prisma.taskDependency.findUnique({ where }))) throw notFound('Dependencia no encontrada');
    await prisma.taskDependency.delete({ where });
    return c.json(await loadDto(c.var.deps.prisma, successor.id));
  });
}
