import { decisionRecordSchema, updateDecisionRecordSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { fieldError, notFound } from '../errors';

type ItemParams = { id: string; decisionId: string };
type Tx = Prisma.TransactionClient | PrismaClient;

export const decisionInclude = {
  changeRequest: { select: { id: true, number: true, title: true } },
  incident: { select: { id: true, number: true, title: true } },
} satisfies Prisma.DecisionInclude;

const toDecisionDto = (d: Prisma.DecisionGetPayload<{ include: typeof decisionInclude }>) => {
  const { projectId: _p, changeRequestId: _c, incidentId: _i, updatedAt: _u, ...fields } = d;
  return fields;
};

/** Crea una decisión con el siguiente número del proyecto. Se usa también al cerrar un incidente. */
export async function createDecision(tx: Tx, projectId: string, data: Omit<Prisma.DecisionUncheckedCreateInput, 'projectId' | 'number'>) {
  const { lastDecisionNumber } = await tx.project.update({
    where: { id: projectId },
    data: { lastDecisionNumber: { increment: 1 } },
    select: { lastDecisionNumber: true },
  });
  return tx.decision.create({ data: { ...data, projectId, number: lastDecisionNumber }, include: decisionInclude });
}

export async function decisionRoutes(app: FastifyInstance) {
  const { prisma } = app;
  const base = '/api/projects/:id/decisions';

  const assertLinks = async (projectId: string, input: { changeRequestId?: string | null; incidentId?: string | null }) => {
    if (input.changeRequestId && !(await prisma.changeRequest.findFirst({ where: { id: input.changeRequestId, projectId }, select: { id: true } }))) {
      throw fieldError('changeRequestId', 'La solicitud de cambio no pertenece al proyecto');
    }
    if (input.incidentId && !(await prisma.incident.findFirst({ where: { id: input.incidentId, projectId }, select: { id: true } }))) {
      throw fieldError('incidentId', 'El incidente no pertenece al proyecto');
    }
  };

  const findDecision = async (projectId: string, decisionId: string) => {
    const decision = await prisma.decision.findFirst({ where: { id: decisionId, projectId } });
    if (!decision) throw notFound('Decisión no encontrada');
    return decision;
  };

  app.get<{ Params: { id: string } }>(base, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const items = await prisma.decision.findMany({ where: { projectId: project.id }, include: decisionInclude, orderBy: { number: 'desc' } });
    return items.map(toDecisionDto);
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = decisionRecordSchema.parse(req.body);
    await assertLinks(project.id, input);
    const created = await prisma.$transaction((tx) => createDecision(tx, project.id, input));
    return reply.status(201).send(toDecisionDto(created));
  });

  app.patch<{ Params: ItemParams }>(`${base}/:decisionId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const decision = await findDecision(project.id, req.params.decisionId);
    const input = updateDecisionRecordSchema.parse(req.body);
    await assertLinks(project.id, input);
    return toDecisionDto(await prisma.decision.update({ where: { id: decision.id }, data: input, include: decisionInclude }));
  });

  app.delete<{ Params: ItemParams }>(`${base}/:decisionId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const decision = await findDecision(project.id, req.params.decisionId);
    await prisma.decision.delete({ where: { id: decision.id } });
    return { ok: true };
  });
}
