import { CHARTER_REQUIRED_TO_APPROVE, CHARTER_RICH_FIELDS, charterSchema, isBlankRichText } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError } from '../errors';
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
    const project = await requireProjectPm(c, c.req.param('id'));
    const input = charterSchema.parse(sanitizeFields(await readBody(c), CHARTER_RICH_FIELDS));
    const current = await loadCharter(prisma, project.id);
    // Se compara con lo guardado ya limpio: un texto antiguo convertido a párrafos no cuenta como cambio.
    const changed =
      input.sponsor !== current.sponsor || CHARTER_RICH_FIELDS.some((field) => input[field] !== sanitizeRichText(current[field]));
    if (!changed) return c.json(current);
    await prisma.charter.update({
      where: { projectId: project.id },
      data: { ...input, status: 'DRAFT', approvedById: null, approvedAt: null },
    });
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });

  app.post('/api/projects/:id/charter/approve', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const user = requireUser(c);
    const current = await loadCharter(prisma, project.id);

    const fields: Record<string, string> = {};
    for (const field of CHARTER_REQUIRED_TO_APPROVE) {
      if (isBlankRichText(current[field])) fields[field] = 'Este campo es obligatorio para aprobar el acta';
    }
    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'charter_incomplete', 'Completa los campos obligatorios para aprobar el acta', { fields });
    }

    await prisma.charter.update({
      where: { projectId: project.id },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: c.var.deps.now() },
    });
    return c.json(await loadCharter(c.var.deps.prisma, project.id));
  });
}
