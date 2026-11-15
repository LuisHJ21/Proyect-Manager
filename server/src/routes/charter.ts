import { CHARTER_REQUIRED_TO_APPROVE, CHARTER_RICH_FIELDS, approveCharterSchema, charterSchema, isBlankRichText } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, editConflict } from '../errors';
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

    const { count } = await prisma.charter.updateMany({
      where: { projectId: project.id, version },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: c.var.deps.now(), version: { increment: 1 } },
    });
    if (count === 0) throw editConflict();
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });
}
