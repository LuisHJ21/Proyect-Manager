import { createProjectSchema, DATE_ORDER_MESSAGE, deleteProjectSchema, isDateOrderValid, updateProjectSchema } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { getProjectAccess, requireProjectPm, toProjectDto } from '../auth/access';
import { requirePm, requireUser } from '../auth/guards';
import { fieldError } from '../errors';
import { removeStoredFiles } from '../files';

export async function projectRoutes(app: FastifyInstance) {
  const { prisma } = app;

  app.get('/api/projects', async (req) => {
    const user = requireUser(req);
    const isPm = user.role === 'PM';
    const projects = await prisma.project.findMany({
      where: isPm ? {} : { members: { some: { userId: user.id } } },
      orderBy: { name: 'asc' },
    });
    return projects.map((project) => toProjectDto(project, isPm));
  });

  app.post('/api/projects', async (req, reply) => {
    requirePm(req);
    const input = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({ data: { ...input, charter: { create: {} } } });
    return reply.status(201).send(toProjectDto(project, true));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const { project, isPm } = await getProjectAccess(req, req.params.id);
    return toProjectDto(project, isPm);
  });

  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = updateProjectSchema.parse(req.body);
    const startDate = input.startDate === undefined ? project.startDate : input.startDate;
    const endDate = input.endDate === undefined ? project.endDate : input.endDate;
    if (!isDateOrderValid(startDate, endDate)) throw fieldError('startDate', DATE_ORDER_MESSAGE);
    const updated = await prisma.project.update({ where: { id: project.id }, data: input });
    return toProjectDto(updated, true);
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const { confirmName } = deleteProjectSchema.parse(req.body);
    if (confirmName !== project.name) {
      throw fieldError('confirmName', 'Escribe el nombre exacto del proyecto para confirmar');
    }
    const attachments = await prisma.attachment.findMany({ where: { projectId: project.id }, select: { storedName: true } });
    await prisma.project.delete({ where: { id: project.id } });
    await removeStoredFiles(app.dataDir, attachments.map((a) => a.storedName));
    return { ok: true };
  });
}
