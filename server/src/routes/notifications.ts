import type { Prisma } from '@prisma/client';
import { requireUser } from '../auth/guards';
import { notFound } from '../errors';
import type { App, Ctx } from '../http';

const PAGE_SIZE = 30;

/** Avisos del usuario en proyectos a los que tiene acceso hoy: el PM, todos; los demás, donde son miembros. */
function visibleTo(c: Ctx): Prisma.NotificationWhereInput {
  const user = requireUser(c);
  return user.role === 'PM' ? { userId: user.id } : { userId: user.id, project: { members: { some: { userId: user.id } } } };
}

/** Avisos dentro de la aplicación: cada persona solo ve y marca los suyos. */
export function notificationRoutes(app: App) {
  app.get('/api/notifications', async (c) => {
    const { prisma } = c.var.deps;
    const { before } = c.req.query();
    const rows = await prisma.notification.findMany({
      where: visibleTo(c),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: { project: { select: { name: true } } },
    });
    const items = rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      kind: row.kind,
      projectId: row.projectId,
      projectName: row.project.name,
      entityId: row.entityId,
      title: row.title,
      actorName: row.actorName,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    return c.json({ items, nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null });
  });

  app.get('/api/notifications/unread-count', async (c) => {
    const count = await c.var.deps.prisma.notification.count({ where: { ...visibleTo(c), readAt: null } });
    return c.json({ count });
  });

  app.post('/api/notifications/read-all', async (c) => {
    await c.var.deps.prisma.notification.updateMany({ where: { ...visibleTo(c), readAt: null }, data: { readAt: c.var.deps.now() } });
    return c.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', async (c) => {
    const { prisma } = c.var.deps;
    const where = { ...visibleTo(c), id: c.req.param('id') };
    const { count } = await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: c.var.deps.now() } });
    if (count === 0 && !(await prisma.notification.findFirst({ where, select: { id: true } }))) throw notFound('Aviso no encontrado');
    return c.json({ ok: true });
  });
}
