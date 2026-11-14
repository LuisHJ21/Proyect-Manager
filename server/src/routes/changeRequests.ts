import { changeRequestSchema, decisionSchema, updateChangeRequestSchema } from '@pm/shared';
import type { ChangeRequest, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, notFound } from '../errors';

type ItemParams = { id: string; crId: string };

const decidedByInclude = { decidedBy: { select: { id: true, name: true } } } as const;

export function toChangeRequestDto(cr: ChangeRequest & { decidedBy: { id: string; name: string } | null }) {
  const { projectId: _projectId, decidedById: _decidedById, costImpactCents, ...fields } = cr;
  return { ...fields, costImpactCents: costImpactCents === null ? null : Number(costImpactCents) };
}

export function changeRequestRoutes(app: App) {
  const base = '/api/projects/:id/change-requests';

  const findPending = async (prisma: PrismaClient, projectId: string, crId: string) => {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId } });
    if (!cr) throw notFound('Solicitud de cambio no encontrada');
    if (cr.status !== 'PENDING') throw new AppError(409, 'change_decided', 'Esta solicitud ya fue decidida y no se puede modificar');
    return cr;
  };

  const toBigInt = (value: number | null | undefined) => (value === undefined ? undefined : value === null ? null : BigInt(value));

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'read');
    const items = await prisma.changeRequest.findMany({ where: { projectId: project.id }, include: decidedByInclude, orderBy: { number: 'desc' } });
    return c.json(items.map(toChangeRequestDto));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const { costImpactCents, ...input } = changeRequestSchema.parse(await readBody(c));
    const created = await prisma.$transaction(async (tx) => {
      // El contador del proyecto evita reutilizar el número de una solicitud borrada.
      const { lastChangeNumber } = await tx.project.update({
        where: { id: project.id },
        data: { lastChangeNumber: { increment: 1 } },
        select: { lastChangeNumber: true },
      });
      return tx.changeRequest.create({
        data: { ...input, costImpactCents: toBigInt(costImpactCents), number: lastChangeNumber, projectId: project.id },
        include: decidedByInclude,
      });
    });
    return c.json(toChangeRequestDto(created), 201);
  });

  app.patch(`${base}/:crId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    const { costImpactCents, ...input } = updateChangeRequestSchema.parse(await readBody(c));
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { ...input, costImpactCents: toBigInt(costImpactCents) },
      include: decidedByInclude,
    });
    return c.json(toChangeRequestDto(updated));
  });

  app.delete(`${base}/:crId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    await prisma.changeRequest.delete({ where: { id: cr.id } });
    return c.json({ ok: true });
  });

  app.post(`${base}/:crId/decision`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const user = requireUser(c);
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    const { status, note } = decisionSchema.parse(await readBody(c));
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status, decisionNote: note, decidedAt: c.var.deps.now(), decidedById: user.id },
      include: decidedByInclude,
    });
    return c.json(toChangeRequestDto(updated));
  });
}
