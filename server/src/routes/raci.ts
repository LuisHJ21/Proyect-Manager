import { raciActivitySchema, raciCellSchema, updateRaciActivitySchema } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { requireProjectAccess } from '../auth/access';
import { raciWarnings } from '../domain/raci';
import { fieldError, notFound } from '../errors';

type ActivityParams = { id: string; activityId: string };

export function raciRoutes(app: App) {
  const findActivity = async (prisma: PrismaClient, projectId: string, activityId: string) => {
    const activity = await prisma.raciActivity.findFirst({ where: { id: activityId, projectId } });
    if (!activity) throw notFound('Actividad no encontrada');
    return activity;
  };

  const toActivityDto = (a: { id: string; title: string; description: string }) => ({ id: a.id, title: a.title, description: a.description });

  app.get('/api/projects/:id/raci', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'raci', 'read');
    const [activities, members, stakeholders] = await Promise.all([
      prisma.raciActivity.findMany({
        where: { projectId: project.id },
        include: { cells: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.projectMember.findMany({ where: { projectId: project.id }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } }),
      prisma.stakeholder.findMany({ where: { projectId: project.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return c.json({
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
    });
  });

  app.post('/api/projects/:id/raci/activities', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'raci', 'write');
    const input = raciActivitySchema.parse(await readBody(c));
    const activity = await prisma.raciActivity.create({ data: { ...input, projectId: project.id } });
    return c.json(toActivityDto(activity), 201);
  });

  app.patch('/api/projects/:id/raci/activities/:activityId', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'raci', 'write');
    const activity = await findActivity(prisma, project.id, c.req.param('activityId'));
    const input = updateRaciActivitySchema.parse(await readBody(c));
    return c.json(toActivityDto(await prisma.raciActivity.update({ where: { id: activity.id }, data: input })));
  });

  app.put('/api/projects/:id/raci/cells', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'raci', 'write');
    const input = raciCellSchema.parse(await readBody(c));
    const activity = await findActivity(prisma, project.id, input.activityId);
    const party =
      input.kind === 'member'
        ? await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: input.partyId } } })
        : await prisma.stakeholder.findFirst({ where: { id: input.partyId, projectId: project.id } });
    if (!party) throw fieldError('partyId', 'El participante no pertenece al proyecto');

    const owner = input.kind === 'member' ? { userId: input.partyId } : { stakeholderId: input.partyId };
    if (input.role === null) {
      await prisma.raciCell.deleteMany({ where: { activityId: activity.id, ...owner } });
    } else {
      const where =
        input.kind === 'member'
          ? { activityId_userId: { activityId: activity.id, userId: input.partyId } }
          : { activityId_stakeholderId: { activityId: activity.id, stakeholderId: input.partyId } };
      await prisma.raciCell.upsert({ where, update: { role: input.role }, create: { activityId: activity.id, role: input.role, ...owner } });
    }
    return c.json({ ok: true });
  });

  app.delete('/api/projects/:id/raci/activities/:activityId', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'raci', 'write');
    const activity = await findActivity(prisma, project.id, c.req.param('activityId'));
    await prisma.raciActivity.delete({ where: { id: activity.id } });
    return c.json({ ok: true });
  });
}
