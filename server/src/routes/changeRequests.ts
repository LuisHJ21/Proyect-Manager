import { changeRequestSchema, decisionSchema, updateChangeRequestSchema } from '@pm/shared';
import type { ChangeRequest } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, notFound } from '../errors';

type ItemParams = { id: string; crId: string };

const decidedByInclude = { decidedBy: { select: { id: true, name: true } } } as const;

export function toChangeRequestDto(cr: ChangeRequest & { decidedBy: { id: string; name: string } | null }) {
  const { projectId: _projectId, decidedById: _decidedById, costImpactCents, ...fields } = cr;
  return { ...fields, costImpactCents: costImpactCents === null ? null : Number(costImpactCents) };
}

export async function changeRequestRoutes(app: FastifyInstance) {
  const { prisma } = app;
  const base = '/api/projects/:id/change-requests';

  const findPending = async (projectId: string, crId: string) => {
    const cr = await prisma.changeRequest.findFirst({ where: { id: crId, projectId } });
    if (!cr) throw notFound('Solicitud de cambio no encontrada');
    if (cr.status !== 'PENDING') throw new AppError(409, 'change_decided', 'Esta solicitud ya fue decidida y no se puede modificar');
    return cr;
  };

  const toBigInt = (value: number | null | undefined) => (value === undefined ? undefined : value === null ? null : BigInt(value));

  app.get<{ Params: { id: string } }>(base, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const items = await prisma.changeRequest.findMany({ where: { projectId: project.id }, include: decidedByInclude, orderBy: { number: 'desc' } });
    return items.map(toChangeRequestDto);
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const { costImpactCents, ...input } = changeRequestSchema.parse(req.body);
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
    return reply.status(201).send(toChangeRequestDto(created));
  });

  app.patch<{ Params: ItemParams }>(`${base}/:crId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const cr = await findPending(project.id, req.params.crId);
    const { costImpactCents, ...input } = updateChangeRequestSchema.parse(req.body);
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { ...input, costImpactCents: toBigInt(costImpactCents) },
      include: decidedByInclude,
    });
    return toChangeRequestDto(updated);
  });

  app.delete<{ Params: ItemParams }>(`${base}/:crId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const cr = await findPending(project.id, req.params.crId);
    await prisma.changeRequest.delete({ where: { id: cr.id } });
    return { ok: true };
  });

  app.post<{ Params: ItemParams }>(`${base}/:crId/decision`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const user = requireUser(req);
    const cr = await findPending(project.id, req.params.crId);
    const { status, note } = decisionSchema.parse(req.body);
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status, decisionNote: note, decidedAt: app.now(), decidedById: user.id },
      include: decidedByInclude,
    });
    return toChangeRequestDto(updated);
  });
}
