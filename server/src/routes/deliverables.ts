import {
  criteriaOrderSchema,
  criterionSchema,
  DELIVERABLE_STATUS,
  deliverableSchema,
  isDeliverableOverdue,
  canTransition,
  updateCriterionSchema,
  updateDeliverableSchema,
  type DeliverableStatus,
} from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, readQuery, type App, type Ctx } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { AppError, editConflict, fieldError, forbidden, notFound } from '../errors';
import { sanitizeRichText } from '../richText';

type Params = { id: string; did: string };
type CriterionParams = Params & { cid: string };

export const deliverableDetailInclude = {
  milestone: { select: { id: true, name: true } },
  criteria: { orderBy: { position: 'asc' } },
  reviews: {
    orderBy: { createdAt: 'desc' },
    include: { stakeholder: { select: { id: true, name: true } }, attachment: { select: { id: true, originalName: true } } },
  },
} satisfies Prisma.DeliverableInclude;

type DeliverableWithAll = Prisma.DeliverableGetPayload<{ include: typeof deliverableDetailInclude }>;

/**
 * Forma pública de un entregable: la de la lista o, con `detail`, la del detalle con criterios e historial.
 * Quien revisó suele ser un interesado: solo el PM recibe su nombre.
 */
export function toDeliverableDto(d: DeliverableWithAll, today: string, detail: boolean, isPm = true) {
  const last = d.reviews[0];
  const row = {
    id: d.id,
    number: d.number,
    name: d.name,
    version: d.version,
    status: d.status,
    dueDate: d.dueDate,
    overdue: isDeliverableOverdue(d, today),
    milestone: d.milestone,
    criteriaMet: d.criteria.filter((c) => c.met).length,
    criteriaTotal: d.criteria.length,
    lastReview: last
      ? { outcome: last.outcome, reviewedOn: last.reviewedOn, ...(isPm ? { stakeholderName: last.stakeholder?.name ?? last.stakeholderName } : {}) }
      : null,
  };
  if (!detail) return row;
  return {
    ...row,
    description: d.description,
    criteria: d.criteria.map((c) => ({ id: c.id, text: c.text, met: c.met, position: c.position })),
    reviews: d.reviews.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      ...(isPm ? { stakeholder: r.stakeholder, stakeholderName: r.stakeholderName } : {}),
      reviewedOn: r.reviewedOn,
      note: r.note,
      attachment: r.attachment,
      attachmentName: r.attachmentName,
      criteria: JSON.parse(r.criteria) as { text: string; met: boolean }[],
      createdAt: r.createdAt,
    })),
  };
}

export async function findDeliverable(prisma: PrismaClient, projectId: string, deliverableId: string) {
  const deliverable = await prisma.deliverable.findFirst({ where: { id: deliverableId, projectId } });
  if (!deliverable) throw notFound('Entregable no encontrado');
  return deliverable;
}

export async function loadDeliverableDetail(prisma: PrismaClient, id: string, today: string, isPm = true) {
  const d = await prisma.deliverable.findUniqueOrThrow({ where: { id }, include: deliverableDetailInclude });
  return toDeliverableDto(d, today, true, isPm);
}

const acceptedLocked = () => new AppError(409, 'deliverable_accepted', 'El entregable está aceptado: reábrelo para cambiar sus criterios');

export function deliverableRoutes(app: App) {
  const base = '/api/projects/:id/deliverables';
  const today = (c: Ctx) => c.var.deps.today();

  const assertMilestone = async (prisma: PrismaClient, projectId: string, milestoneId: string | null | undefined) => {
    if (milestoneId && !(await prisma.milestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true } }))) {
      throw fieldError('milestoneId', 'El hito no pertenece al proyecto');
    }
  };

  /** Entregable editable en sus criterios (no aceptado). */
  const findOpen = async (prisma: PrismaClient, projectId: string, did: string) => {
    const deliverable = await findDeliverable(prisma, projectId, did);
    if (deliverable.status === 'ACCEPTED') throw acceptedLocked();
    return deliverable;
  };

  const findCriterion = async (prisma: PrismaClient, deliverableId: string, cid: string) => {
    const criterion = await prisma.deliverableCriterion.findFirst({ where: { id: cid, deliverableId } });
    if (!criterion) throw notFound('Criterio no encontrado');
    return criterion;
  };

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project, can } = await getProjectAccess(c, c.req.param('id'));
    if (!can.read('deliverables')) throw forbidden();
    const { status } = readQuery(c);
    if (status !== undefined && (typeof status !== 'string' || !(DELIVERABLE_STATUS as readonly string[]).includes(status))) {
      throw fieldError('status', 'Estado no válido');
    }
    const items = await prisma.deliverable.findMany({
      where: { projectId: project.id, ...(status ? { status } : {}) },
      include: deliverableDetailInclude,
      orderBy: { number: 'asc' },
    });
    return c.json(items.map((d) => toDeliverableDto(d, today(c), false, can.write('deliverables'))));
  });

  app.get(`${base}/:did`, async (c) => {
    const { prisma } = c.var.deps;
    const { project, can } = await getProjectAccess(c, c.req.param('id'));
    if (!can.read('deliverables')) throw forbidden();
    const deliverable = await findDeliverable(prisma, project.id, c.req.param('did'));
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c), can.write('deliverables')));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const { criteria = [], ...input } = deliverableSchema.parse(await readBody(c));
    await assertMilestone(c.var.deps.prisma, project.id, input.milestoneId);
    const texts = criteria.map((t) => t.trim()).filter(Boolean);
    const created = await prisma.$transaction(async (tx) => {
      const { lastDeliverableNumber } = await tx.project.update({
        where: { id: project.id },
        data: { lastDeliverableNumber: { increment: 1 } },
        select: { lastDeliverableNumber: true },
      });
      return tx.deliverable.create({
        data: {
          ...input,
          description: sanitizeRichText(input.description),
          projectId: project.id,
          number: lastDeliverableNumber,
          criteria: { create: texts.map((text, position) => ({ text, position })) },
        },
        include: deliverableDetailInclude,
      });
    });
    return c.json(toDeliverableDto(created, today(c), true), 201);
  });

  app.patch(`${base}/:did`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findDeliverable(prisma, project.id, c.req.param('did'));
    const { version, ...input } = updateDeliverableSchema.parse(await readBody(c));
    if (input.status === 'ACCEPTED' || input.status === 'REJECTED') {
      throw fieldError('status', 'Para aceptar o rechazar registra una revisión');
    }
    if (input.status && input.status !== deliverable.status && !canTransition(deliverable.status as DeliverableStatus, input.status)) {
      throw new AppError(409, 'invalid_transition', 'Ese cambio de estado no está permitido');
    }
    await assertMilestone(c.var.deps.prisma, project.id, input.milestoneId);
    const { count } = await prisma.deliverable.updateMany({
      where: { id: deliverable.id, version },
      data: { ...input, ...(input.description !== undefined ? { description: sanitizeRichText(input.description) } : {}), version: { increment: 1 } },
    });
    if (count === 0) throw editConflict();
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c)));
  });

  app.delete(`${base}/:did`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findDeliverable(prisma, project.id, c.req.param('did'));
    await prisma.deliverable.delete({ where: { id: deliverable.id } });
    return c.json({ ok: true });
  });

  app.post(`${base}/:did/criteria`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findOpen(c.var.deps.prisma, project.id, c.req.param('did'));
    const { text } = criterionSchema.parse(await readBody(c));
    const last = await prisma.deliverableCriterion.aggregate({ where: { deliverableId: deliverable.id }, _max: { position: true } });
    await prisma.deliverableCriterion.create({ data: { deliverableId: deliverable.id, text, position: (last._max.position ?? -1) + 1 } });
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c)));
  });

  // La ruta de orden va antes que la de un criterio para que "order" no se tome como id.
  app.put(`${base}/:did/criteria/order`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findOpen(c.var.deps.prisma, project.id, c.req.param('did'));
    const { ids } = criteriaOrderSchema.parse(await readBody(c));
    const current = await prisma.deliverableCriterion.findMany({ where: { deliverableId: deliverable.id }, select: { id: true } });
    const known = new Set(current.map((c) => c.id));
    if (new Set(ids).size !== ids.length || ids.length !== current.length || !ids.every((id) => known.has(id))) {
      throw fieldError('ids', 'La lista de criterios no coincide con la actual');
    }
    await prisma.$transaction(ids.map((id, position) => prisma.deliverableCriterion.update({ where: { id }, data: { position } })));
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c)));
  });

  app.patch(`${base}/:did/criteria/:cid`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findOpen(c.var.deps.prisma, project.id, c.req.param('did'));
    const criterion = await findCriterion(c.var.deps.prisma, deliverable.id, c.req.param('cid'));
    const input = updateCriterionSchema.parse(await readBody(c));
    await prisma.deliverableCriterion.update({ where: { id: criterion.id }, data: input });
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c)));
  });

  app.delete(`${base}/:did/criteria/:cid`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const deliverable = await findOpen(c.var.deps.prisma, project.id, c.req.param('did'));
    const criterion = await findCriterion(c.var.deps.prisma, deliverable.id, c.req.param('cid'));
    await prisma.deliverableCriterion.delete({ where: { id: criterion.id } });
    return c.json(await loadDeliverableDetail(prisma, deliverable.id, today(c)));
  });
}
