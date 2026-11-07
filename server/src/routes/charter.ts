import { CHARTER_REQUIRED_TO_APPROVE, CHARTER_RICH_FIELDS, charterSchema, isBlankRichText } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError } from '../errors';
import { sanitizeFields, sanitizeRichText } from '../richText';

export async function charterRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const loadCharter = (projectId: string) =>
    prisma.charter.findUniqueOrThrow({ where: { projectId }, include: { approvedBy: { select: { id: true, name: true } } } });

  app.get<{ Params: { id: string } }>('/api/projects/:id/charter', async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    return loadCharter(project.id);
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id/charter', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = charterSchema.parse(sanitizeFields(req.body, CHARTER_RICH_FIELDS));
    const current = await loadCharter(project.id);
    // Se compara con lo guardado ya limpio: un texto antiguo convertido a párrafos no cuenta como cambio.
    const changed =
      input.sponsor !== current.sponsor || CHARTER_RICH_FIELDS.some((field) => input[field] !== sanitizeRichText(current[field]));
    if (!changed) return current;
    await prisma.charter.update({
      where: { projectId: project.id },
      data: { ...input, status: 'DRAFT', approvedById: null, approvedAt: null },
    });
    return loadCharter(project.id);
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/charter/approve', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const user = requireUser(req);
    const current = await loadCharter(project.id);

    const fields: Record<string, string> = {};
    for (const field of CHARTER_REQUIRED_TO_APPROVE) {
      if (isBlankRichText(current[field])) fields[field] = 'Este campo es obligatorio para aprobar el acta';
    }
    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'charter_incomplete', 'Completa los campos obligatorios para aprobar el acta', { fields });
    }

    await prisma.charter.update({
      where: { projectId: project.id },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: app.now() },
    });
    return loadCharter(project.id);
  });
}
