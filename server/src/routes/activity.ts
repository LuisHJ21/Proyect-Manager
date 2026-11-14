import { ACTIVITY_ENTITY, type ActivityChange, type ActivityEntity } from '@pm/shared';
import { requireProjectAccess } from '../auth/access';
import { fieldError } from '../errors';
import type { App } from '../http';

const PAGE_SIZE = 50;

/** Bitácora del proyecto: solo para quien puede leer la sección `activity` (el PM). */
export function activityRoutes(app: App) {
  app.get('/api/projects/:id/activity', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'activity', 'read');
    const { userId, entity, before } = c.req.query();
    if (entity && !(ACTIVITY_ENTITY as readonly string[]).includes(entity)) throw fieldError('entity', 'Tipo de elemento no válido');
    const rows = await prisma.activityLog.findMany({
      where: { projectId: project.id, ...(userId ? { userId } : {}), ...(entity ? { entity } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: { user: { select: { id: true, name: true } } },
    });
    const items = rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      changes: row.changes as ActivityChange[],
      createdAt: row.createdAt.toISOString(),
      user: row.user,
    }));
    return c.json({ items, nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null });
  });

  app.get('/api/projects/:id/activity/filters', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'activity', 'read');
    // groupBy agrupa en la base; `distinct` de Prisma leería toda la bitácora del proyecto.
    const [people, kinds] = await Promise.all([
      prisma.activityLog.groupBy({ by: ['userId'], where: { projectId: project.id } }),
      prisma.activityLog.groupBy({ by: ['entity'], where: { projectId: project.id } }),
    ]);
    const users = await prisma.user.findMany({ where: { id: { in: people.map((p) => p.userId) } }, select: { id: true, name: true } });
    return c.json({
      users: users.sort((a, b) => a.name.localeCompare(b.name, 'es')),
      entities: kinds.map((k) => k.entity as ActivityEntity).sort(),
    });
  });
}
