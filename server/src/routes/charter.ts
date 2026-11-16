import { CHARTER_REQUIRED_TO_APPROVE, CHARTER_RICH_FIELDS, approveCharterSchema, charterSchema, isBlankRichText } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, editConflict, notFound } from '../errors';
import { sanitizeFields, sanitizeRichText } from '../richText';

export function charterRoutes(app: App) {
  const loadCharter = (prisma: PrismaClient, projectId: string) =>
    prisma.charter.findUniqueOrThrow({ where: { projectId }, include: { approvedBy: { select: { id: true, name: true } } } });

  app.get('/api/projects/:id/charter', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });

  app.put('/api/projects/:id/charter', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'planning', 'write');
    const { version, ...input } = charterSchema.parse(sanitizeFields(await readBody(c), CHARTER_RICH_FIELDS));
    const current = await loadCharter(prisma, project.id);
    // Se compara con lo guardado ya limpio: un texto antiguo convertido a párrafos no cuenta como cambio.
    const changed =
      input.sponsor !== current.sponsor || CHARTER_RICH_FIELDS.some((field) => input[field] !== sanitizeRichText(current[field]));
    if (!changed) return c.json(current);
    const { count } = await prisma.charter.updateMany({
      where: { projectId: project.id, version },
      data: { ...input, status: 'DRAFT', approvedById: null, approvedAt: null, version: { increment: 1 } },
    });
    if (count === 0) throw editConflict();
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });

  app.post('/api/projects/:id/charter/approve', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'planning', 'write');
    const user = requireUser(c);
    const { version } = approveCharterSchema.parse(await readBody(c));
    const current = await loadCharter(prisma, project.id);

    const fields: Record<string, string> = {};
    for (const field of CHARTER_REQUIRED_TO_APPROVE) {
      if (isBlankRichText(current[field])) fields[field] = 'Este campo es obligatorio para aprobar el acta';
    }
    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'charter_incomplete', 'Completa los campos obligatorios para aprobar el acta', { fields });
    }

    const approvedAt = c.var.deps.now();
    // La aprobación y su versión congelada van juntas: un conflicto de edición no deja versión huérfana (F18).
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.charter.updateMany({
        where: { projectId: project.id, version },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt, version: { increment: 1 } },
      });
      if (count === 0) throw editConflict();
      const [charter, objectives, milestones, counter] = await Promise.all([
        tx.charter.findUniqueOrThrow({ where: { projectId: project.id } }),
        tx.objective.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' }, select: { description: true, metric: true, target: true, status: true } }),
        tx.milestone.findMany({ where: { projectId: project.id }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], select: { name: true, dueDate: true, status: true } }),
        tx.project.update({ where: { id: project.id }, data: { lastCharterVersion: { increment: 1 } }, select: { lastCharterVersion: true } }),
      ]);
      const content = { sponsor: charter.sponsor, ...Object.fromEntries(CHARTER_RICH_FIELDS.map((field) => [field, charter[field]])), objectives, milestones };
      await tx.charterVersion.create({ data: { projectId: project.id, number: counter.lastCharterVersion, content, approvedById: user.id, approvedAt } });
    });
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });

  const approver = { select: { id: true, name: true } } as const;

  app.get('/api/projects/:id/charter/versions', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const versions = await c.var.deps.prisma.charterVersion.findMany({
      where: { projectId: project.id },
      select: { number: true, approvedAt: true, approvedBy: approver },
      orderBy: { number: 'desc' },
    });
    return c.json(versions);
  });

  app.get('/api/projects/:id/charter/versions/:number', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const number = Number(c.req.param('number'));
    const version = Number.isInteger(number)
      ? await c.var.deps.prisma.charterVersion.findUnique({
          where: { projectId_number: { projectId: project.id, number } },
          select: { number: true, approvedAt: true, approvedBy: approver, content: true },
        })
      : null;
    if (!version) throw notFound('Versión no encontrada');
    return c.json(version);
  });
}
