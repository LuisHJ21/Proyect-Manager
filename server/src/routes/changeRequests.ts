import { applyChangeSchema, changeRequestSchema, DATE_ORDER_MESSAGE, decisionSchema, isDateOrderValid, proposeChangeSchema, updateChangeRequestSchema } from '@pm/shared';
import type { ChangeRequest, Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, fieldError, forbidden, notFound } from '../errors';
import { notify } from '../notifications';
import { createBaseline } from './performance';
import { assertDatesStayInside } from './projects';

type ItemParams = { id: string; crId: string };

type Person = { id: string; name: string };
type ChangeRequestRow = ChangeRequest & {
  decidedBy: Person | null;
  requestedByUser: Person | null;
  appliedBy: Person | null;
  requirements: { requirement: { id: string; number: number } }[];
};

const decidedByInclude = {
  decidedBy: { select: { id: true, name: true } },
  requestedByUser: { select: { id: true, name: true } },
  appliedBy: { select: { id: true, name: true } },
  requirements: { include: { requirement: { select: { id: true, number: true } } } },
} as const;

/** Requisitos citados, por número. */
const requirementsOf = (cr: ChangeRequestRow) => cr.requirements.map((r) => r.requirement).sort((a, b) => a.number - b.number);

/** Requisitos sin repetir, todos del proyecto. */
async function assertRequirements(prisma: PrismaClient, projectId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const count = await prisma.requirement.count({ where: { id: { in: unique }, projectId } });
  if (count !== unique.length) throw fieldError('requirementIds', 'El requisito no pertenece a este proyecto');
  return unique;
}

/** Vista del PM: todo, más quién la propuso desde el equipo. */
export function toChangeRequestDto(cr: ChangeRequestRow) {
  const { projectId: _projectId, decidedById: _decidedById, requestedById: _requestedById, appliedById: _appliedById, requestedByUser, costImpactCents, requirements: _r, ...fields } = cr;
  return { ...fields, proposedBy: requestedByUser, costImpactCents: costImpactCents === null ? null : Number(costImpactCents), requirements: requirementsOf(cr) };
}

/** Vista de quien propuso: el estado y la decisión, sin impactos ni solicitante. */
function toProposalDto(cr: ChangeRequestRow) {
  const { id, number, title, description, status, decisionNote, decidedAt, decidedBy, createdAt } = cr;
  return { id, number, title, description, status, decisionNote, decidedAt, decidedBy, createdAt, requirements: requirementsOf(cr) };
}

const PROPOSAL_FIELDS = ['title', 'description', 'requirementIds'];

/** Crea la solicitud con el siguiente número del proyecto. */
function createChangeRequest(
  prisma: PrismaClient,
  projectId: string,
  data: Omit<Prisma.ChangeRequestUncheckedCreateInput, 'projectId' | 'number'>,
  requirementIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    // El contador del proyecto evita reutilizar el número de una solicitud borrada.
    const { lastChangeNumber } = await tx.project.update({
      where: { id: projectId },
      data: { lastChangeNumber: { increment: 1 } },
      select: { lastChangeNumber: true },
    });
    return tx.changeRequest.create({
      data: { ...data, number: lastChangeNumber, projectId, requirements: { create: requirementIds.map((requirementId) => ({ requirementId })) } },
      include: decidedByInclude,
    });
  });
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

  /** `write` para el PM; `own` para quien solo propone y ve las suyas. */
  const accessOf = async (c: Ctx) => {
    const { project, can } = await getProjectAccess(c, c.req.param('id')!);
    const level = can.level('changes');
    if (level !== 'write' && level !== 'own') throw forbidden();
    return { project, own: level === 'own' };
  };

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project, own } = await accessOf(c);
    const where = { projectId: project.id, ...(own ? { requestedById: requireUser(c).id } : {}) };
    const items = await prisma.changeRequest.findMany({ where, include: decidedByInclude, orderBy: { number: 'desc' } });
    return c.json(items.map(own ? toProposalDto : toChangeRequestDto));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project, own } = await accessOf(c);
    const body = await readBody(c);
    if (own) {
      if (body && typeof body === 'object' && Object.keys(body).some((k) => !PROPOSAL_FIELDS.includes(k))) {
        throw forbidden('Solo el Project Manager puede fijar impactos o solicitante');
      }
      const user = requireUser(c);
      const { requirementIds, ...input } = proposeChangeSchema.parse(body);
      const requirements = await assertRequirements(prisma, project.id, requirementIds);
      const created = await createChangeRequest(prisma, project.id, { ...input, requestedById: user.id, requestedBy: user.name }, requirements);
      await notify(prisma, {
        kind: 'CHANGE_PROPOSED',
        projectId: project.id,
        entityId: created.id,
        title: `CR-${created.number} ${created.title}`,
        userIds: async () => (await prisma.user.findMany({ where: { role: 'PM', active: true }, select: { id: true } })).map((u) => u.id),
        actorId: user.id,
        actorName: user.name,
      });
      return c.json(toProposalDto(created), 201);
    }
    const { costImpactCents, requirementIds, ...input } = changeRequestSchema.parse(body);
    const requirements = await assertRequirements(prisma, project.id, requirementIds);
    const created = await createChangeRequest(prisma, project.id, { ...input, costImpactCents: toBigInt(costImpactCents) }, requirements);
    return c.json(toChangeRequestDto(created), 201);
  });

  app.patch(`${base}/:crId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    const { costImpactCents, requirementIds, ...input } = updateChangeRequestSchema.parse(await readBody(c));
    const requirements = requirementIds && (await assertRequirements(prisma, project.id, requirementIds));
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: {
        ...input,
        costImpactCents: toBigInt(costImpactCents),
        ...(requirements ? { requirements: { deleteMany: {}, create: requirements.map((requirementId) => ({ requirementId })) } } : {}),
      },
      include: decidedByInclude,
    });
    return c.json(toChangeRequestDto(updated));
  });

  app.delete(`${base}/:crId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    if (cr.requestedById) throw new AppError(409, 'change_proposed', 'Una propuesta del equipo no se borra: recházala con una nota');
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
    await notify(prisma, {
      kind: 'CHANGE_DECIDED',
      projectId: project.id,
      entityId: updated.id,
      title: `CR-${updated.number} ${updated.title}`,
      userIds: updated.requestedById ? [updated.requestedById] : [],
      actorId: user.id,
      detail: status,
    });
    return c.json(toChangeRequestDto(updated));
  });

  /** Aplica un cambio aprobado al plazo, al presupuesto y, si se pide, a una nueva línea base. Todo o nada. */
  app.post(`${base}/:crId/apply`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const user = requireUser(c);
    const cr = await prisma.changeRequest.findFirst({ where: { id: c.req.param('crId'), projectId: project.id } });
    if (!cr) throw notFound('Solicitud de cambio no encontrada');
    const notApproved = () => new AppError(409, 'change_not_approved', 'Solo se aplica un cambio aprobado');
    if (cr.status !== 'APPROVED') throw notApproved();
    const { endDate, plannedBudgetCents, baseline, reason } = applyChangeSchema.parse(await readBody(c));

    const changes: Prisma.ProjectUpdateInput = {};
    if (endDate !== undefined) {
      if (!isDateOrderValid(project.startDate, endDate)) throw fieldError('startDate', DATE_ORDER_MESSAGE);
      await assertDatesStayInside(prisma, project, { startDate: null, endDate: endDate === project.endDate ? null : endDate });
      changes.endDate = endDate;
    }
    if (plannedBudgetCents !== undefined) changes.plannedBudgetCents = plannedBudgetCents;

    const updated = await prisma.$transaction(async (tx) => {
      // La condición sobre el estado hace que, si llegan dos a la vez, solo una aplique.
      const claimed = await tx.changeRequest.updateMany({
        where: { id: cr.id, status: 'APPROVED' },
        data: { status: 'APPLIED', appliedAt: c.var.deps.now(), appliedById: user.id },
      });
      if (claimed.count === 0) throw notApproved();
      const current = Object.keys(changes).length > 0 ? await tx.project.update({ where: { id: project.id }, data: changes }) : project;
      if (baseline) await createBaseline(tx, current, user.id, { reason: reason || `CR-${cr.number} ${cr.title}`, changeRequestId: cr.id });
      return tx.changeRequest.findUniqueOrThrow({ where: { id: cr.id }, include: decidedByInclude });
    });
    return c.json(toChangeRequestDto(updated));
  });
}
