import { convertAssumptionSchema, createAssumptionSchema, toPlainText, updateAssumptionSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { truncateTitle } from '../domain/incidents';
import { assertOwnerCanOwn } from '../domain/owners';
import { AppError, editConflict, forbidden, notFound } from '../errors';
import { notify } from '../notifications';
import { sanitizeRichText } from '../richText';
import { createIncidentIn } from './incidents';

const assumptionInclude = {
  owner: { select: { id: true, name: true } },
  incident: { select: { id: true, number: true } },
} satisfies Prisma.AssumptionInclude;
type AssumptionRow = Prisma.AssumptionGetPayload<{ include: typeof assumptionInclude }>;

function toAssumptionDto(a: AssumptionRow, today: string) {
  return {
    id: a.id,
    number: a.number,
    description: a.description,
    owner: a.owner,
    validateBy: a.validateBy,
    status: a.status,
    version: a.version,
    risk: a.riskId ? { id: a.riskId } : null,
    incident: a.incident,
    overdue: a.status === 'PENDING' && a.validateBy !== null && a.validateBy < today,
  };
}

const onlyFalse = () => new AppError(409, 'assumption_not_false', 'Solo se convierte un supuesto falso');
const converted = () => new AppError(409, 'assumption_converted', 'Este supuesto ya se convirtió');

/** Registro de supuestos (F15). Se lee como el acta; edita el PM. */
export function assumptionRoutes(app: App) {
  const base = '/api/projects/:id/assumptions';
  const today = (c: Ctx) => c.var.deps.today();

  const access = async (c: Ctx, need: 'read' | 'write') => {
    const result = await getProjectAccess(c, c.req.param('id')!);
    if (need === 'write' ? !result.can.write('planning') : !result.can.read('planning')) throw forbidden();
    return result;
  };
  const find = async (prisma: PrismaClient, projectId: string, id: string) => {
    const item = await prisma.assumption.findFirst({ where: { id, projectId } });
    if (!item) throw notFound('Supuesto no encontrado');
    return item;
  };
  const load = async (prisma: PrismaClient, id: string, c: Ctx) => toAssumptionDto(await prisma.assumption.findUniqueOrThrow({ where: { id }, include: assumptionInclude }), today(c));

  app.get(base, async (c) => {
    const { project } = await access(c, 'read');
    const items = await c.var.deps.prisma.assumption.findMany({ where: { projectId: project.id }, include: assumptionInclude, orderBy: { number: 'asc' } });
    return c.json(items.map((a) => toAssumptionDto(a, today(c))));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const input = createAssumptionSchema.parse(await readBody(c));
    await assertOwnerCanOwn(prisma, project.id, input.ownerId);
    const created = await prisma.$transaction(async (tx) => {
      const { lastAssumptionNumber } = await tx.project.update({ where: { id: project.id }, data: { lastAssumptionNumber: { increment: 1 } }, select: { lastAssumptionNumber: true } });
      return tx.assumption.create({ data: { ...input, description: sanitizeRichText(input.description), projectId: project.id, number: lastAssumptionNumber }, include: assumptionInclude });
    });
    return c.json(toAssumptionDto(created, today(c)), 201);
  });

  app.patch(`${base}/:assumptionId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const current = await find(prisma, project.id, c.req.param('assumptionId'));
    const { version, ...input } = updateAssumptionSchema.parse(await readBody(c));
    await assertOwnerCanOwn(prisma, project.id, input.ownerId);
    const { count } = await prisma.assumption.updateMany({
      where: { id: current.id, version },
      data: { ...input, ...(input.description !== undefined ? { description: sanitizeRichText(input.description) } : {}), version: { increment: 1 } },
    });
    if (count === 0) throw editConflict();
    return c.json(await load(prisma, current.id, c));
  });

  app.delete(`${base}/:assumptionId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const current = await find(prisma, project.id, c.req.param('assumptionId'));
    await prisma.assumption.delete({ where: { id: current.id } });
    return c.json({ ok: true });
  });

  app.post(`${base}/:assumptionId/convert`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const user = requireUser(c);
    const assumption = await find(prisma, project.id, c.req.param('assumptionId'));
    const { kind } = convertAssumptionSchema.parse(await readBody(c));
    if (assumption.riskId || assumption.incidentId) throw converted();
    if (assumption.status !== 'FALSE') throw onlyFalse();
    await assertOwnerCanOwn(prisma, project.id, assumption.ownerId);

    const created = await prisma.$transaction(async (tx) => {
      let link: { riskId: string } | { incidentId: string };
      let incident: { id: string; number: number; title: string; ownerId: string | null } | null = null;
      if (kind === 'risk') {
        const risk = await tx.risk.create({
          data: { projectId: project.id, description: assumption.description, type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE', ownerId: assumption.ownerId },
        });
        await tx.riskAssessment.create({ data: { riskId: risk.id, probability: 3, impact: 3, assessedById: user.id } });
        link = { riskId: risk.id };
      } else {
        incident = await createIncidentIn(tx, project.id, {
          title: truncateTitle(toPlainText(assumption.description)),
          description: assumption.description,
          ownerId: assumption.ownerId,
          reportedById: user.id,
        });
        link = { incidentId: incident.id };
      }
      // Reclama el supuesto: si otra conversión ganó, revierte lo creado.
      const { count } = await tx.assumption.updateMany({ where: { id: assumption.id, riskId: null, incidentId: null, status: 'FALSE' }, data: link });
      if (count === 0) throw converted();
      return incident;
    });
    if (created?.ownerId) {
      await notify(prisma, { kind: 'INCIDENT_ASSIGNED', projectId: project.id, entityId: created.id, title: `INC-${created.number} ${created.title}`, userIds: [created.ownerId], actorId: user.id });
    }
    return c.json(await load(prisma, assumption.id, c));
  });
}
