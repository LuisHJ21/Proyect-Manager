import { decisionRecordSchema, updateDecisionRecordSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
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

export function decisionRoutes(app: App) {
  const base = '/api/projects/:id/decisions';

  const assertLinks = async (prisma: PrismaClient, projectId: string, input: { changeRequestId?: string | null; incidentId?: string | null }) => {
    if (input.changeRequestId && !(await prisma.changeRequest.findFirst({ where: { id: input.changeRequestId, projectId }, select: { id: true } }))) {
      throw fieldError('changeRequestId', 'La solicitud de cambio no pertenece al proyecto');
    }
    if (input.incidentId && !(await prisma.incident.findFirst({ where: { id: input.incidentId, projectId }, select: { id: true } }))) {
      throw fieldError('incidentId', 'El incidente no pertenece al proyecto');
    }
  };

  const findDecision = async (prisma: PrismaClient, projectId: string, decisionId: string) => {
    const decision = await prisma.decision.findFirst({ where: { id: decisionId, projectId } });
    if (!decision) throw notFound('Decisión no encontrada');
    return decision;
  };

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const items = await prisma.decision.findMany({ where: { projectId: project.id }, include: decisionInclude, orderBy: { number: 'desc' } });
    return c.json(items.map(toDecisionDto));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const input = decisionRecordSchema.parse(await readBody(c));
    await assertLinks(c.var.deps.prisma, project.id, input);
    const created = await prisma.$transaction((tx) => createDecision(tx, project.id, input));
    return c.json(toDecisionDto(created), 201);
  });

  app.patch(`${base}/:decisionId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const decision = await findDecision(c.var.deps.prisma, project.id, c.req.param('decisionId'));
    const input = updateDecisionRecordSchema.parse(await readBody(c));
    await assertLinks(c.var.deps.prisma, project.id, input);
    return c.json(toDecisionDto(await prisma.decision.update({ where: { id: decision.id }, data: input, include: decisionInclude })));
  });

  app.delete(`${base}/:decisionId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const decision = await findDecision(c.var.deps.prisma, project.id, c.req.param('decisionId'));
    await prisma.decision.delete({ where: { id: decision.id } });
    return c.json({ ok: true });
  });
}
