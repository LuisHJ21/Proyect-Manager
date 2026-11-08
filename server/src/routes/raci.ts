import { raciActivitySchema, updateRaciActivitySchema } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { raciWarnings } from '../domain/raci';
import { notFound } from '../errors';

type ActivityParams = { id: string; activityId: string };

export async function raciRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const findActivity = async (projectId: string, activityId: string) => {
    const activity = await prisma.raciActivity.findFirst({ where: { id: activityId, projectId } });
    if (!activity) throw notFound('Actividad no encontrada');
    return activity;
  };

  const toActivityDto = (a: { id: string; title: string; description: string }) => ({ id: a.id, title: a.title, description: a.description });

  app.get<{ Params: { id: string } }>('/api/projects/:id/raci', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const [activities, members, stakeholders] = await Promise.all([
      prisma.raciActivity.findMany({
        where: { projectId: project.id },
        include: { cells: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.projectMember.findMany({ where: { projectId: project.id }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } }),
      prisma.stakeholder.findMany({ where: { projectId: project.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      activities: activities.map((a) => ({ ...toActivityDto(a), warnings: raciWarnings(a.cells.map((c) => c.role)) })),
      members: members.map((m) => ({ id: m.user.id, name: m.user.name })),
      stakeholders,
      cells: activities.flatMap((a) =>
        a.cells.map((c) => ({
          activityId: a.id,
          kind: c.userId ? ('member' as const) : ('stakeholder' as const),
          partyId: (c.userId ?? c.stakeholderId)!,
          role: c.role,
        })),
      ),
    };
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/raci/activities', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = raciActivitySchema.parse(req.body);
    const activity = await prisma.raciActivity.create({ data: { ...input, projectId: project.id } });
    return reply.status(201).send(toActivityDto(activity));
  });

  app.patch<{ Params: ActivityParams }>('/api/projects/:id/raci/activities/:activityId', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const activity = await findActivity(project.id, req.params.activityId);
    const input = updateRaciActivitySchema.parse(req.body);
    return toActivityDto(await prisma.raciActivity.update({ where: { id: activity.id }, data: input }));
  });

  app.delete<{ Params: ActivityParams }>('/api/projects/:id/raci/activities/:activityId', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const activity = await findActivity(project.id, req.params.activityId);
    await prisma.raciActivity.delete({ where: { id: activity.id } });
    return { ok: true };
  });
}
