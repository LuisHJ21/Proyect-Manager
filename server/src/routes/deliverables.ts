import {
  criteriaOrderSchema,
  criterionSchema,
  DELIVERABLE_STATUS,
  deliverableSchema,
  isDeliverableOverdue,
  canTransition,
  localToday,
  updateCriterionSchema,
  updateDeliverableSchema,
  type DeliverableStatus,
} from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { AppError, fieldError, notFound } from '../errors';
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

/** Forma pública de un entregable: la de la lista o, con `detail`, la del detalle con criterios e historial. */
export function toDeliverableDto(d: DeliverableWithAll, today: string, detail: boolean) {
  const last = d.reviews[0];
  const row = {
    id: d.id,
    number: d.number,
    name: d.name,
    status: d.status,
    dueDate: d.dueDate,
    overdue: isDeliverableOverdue(d, today),
    milestone: d.milestone,
    criteriaMet: d.criteria.filter((c) => c.met).length,
    criteriaTotal: d.criteria.length,
    lastReview: last ? { outcome: last.outcome, reviewedOn: last.reviewedOn, stakeholderName: last.stakeholder?.name ?? last.stakeholderName } : null,
  };
  if (!detail) return row;
  return {
    ...row,
    description: d.description,
    criteria: d.criteria.map((c) => ({ id: c.id, text: c.text, met: c.met, position: c.position })),
    reviews: d.reviews.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      stakeholder: r.stakeholder,
      stakeholderName: r.stakeholderName,
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

export async function loadDeliverableDetail(prisma: PrismaClient, id: string, today: string) {
  const d = await prisma.deliverable.findUniqueOrThrow({ where: { id }, include: deliverableDetailInclude });
  return toDeliverableDto(d, today, true);
}

const acceptedLocked = () => new AppError(409, 'deliverable_accepted', 'El entregable está aceptado: reábrelo para cambiar sus criterios');

export async function deliverableRoutes(app: FastifyInstance) {
  const { prisma } = app;
  const base = '/api/projects/:id/deliverables';
  const today = () => localToday(app.now());

  const assertMilestone = async (projectId: string, milestoneId: string | null | undefined) => {
    if (milestoneId && !(await prisma.milestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true } }))) {
      throw fieldError('milestoneId', 'El hito no pertenece al proyecto');
    }
  };

  /** Entregable editable en sus criterios (no aceptado). */
  const findOpen = async (projectId: string, did: string) => {
    const deliverable = await findDeliverable(prisma, projectId, did);
    if (deliverable.status === 'ACCEPTED') throw acceptedLocked();
    return deliverable;
  };

  const findCriterion = async (deliverableId: string, cid: string) => {
    const criterion = await prisma.deliverableCriterion.findFirst({ where: { id: cid, deliverableId } });
    if (!criterion) throw notFound('Criterio no encontrado');
    return criterion;
  };

  app.get<{ Params: { id: string }; Querystring: { status?: unknown } }>(base, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const { status } = req.query;
    if (status !== undefined && (typeof status !== 'string' || !(DELIVERABLE_STATUS as readonly string[]).includes(status))) {
      throw fieldError('status', 'Estado no válido');
    }
    const items = await prisma.deliverable.findMany({
      where: { projectId: project.id, ...(status ? { status } : {}) },
      include: deliverableDetailInclude,
      orderBy: { number: 'asc' },
    });
    return items.map((d) => toDeliverableDto(d, today(), false));
  });

  app.get<{ Params: Params }>(`${base}/:did`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findDeliverable(prisma, project.id, req.params.did);
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const { criteria = [], ...input } = deliverableSchema.parse(req.body);
    await assertMilestone(project.id, input.milestoneId);
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
    return reply.status(201).send(toDeliverableDto(created, today(), true));
  });

  app.patch<{ Params: Params }>(`${base}/:did`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findDeliverable(prisma, project.id, req.params.did);
    const input = updateDeliverableSchema.parse(req.body);
    if (input.status === 'ACCEPTED' || input.status === 'REJECTED') {
      throw fieldError('status', 'Para aceptar o rechazar registra una revisión');
    }
    if (input.status && input.status !== deliverable.status && !canTransition(deliverable.status as DeliverableStatus, input.status)) {
      throw new AppError(409, 'invalid_transition', 'Ese cambio de estado no está permitido');
    }
    await assertMilestone(project.id, input.milestoneId);
    await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: { ...input, ...(input.description !== undefined ? { description: sanitizeRichText(input.description) } : {}) },
    });
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });

  app.delete<{ Params: Params }>(`${base}/:did`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findDeliverable(prisma, project.id, req.params.did);
    await prisma.deliverable.delete({ where: { id: deliverable.id } });
    return { ok: true };
  });

  app.post<{ Params: Params }>(`${base}/:did/criteria`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findOpen(project.id, req.params.did);
    const { text } = criterionSchema.parse(req.body);
    const last = await prisma.deliverableCriterion.aggregate({ where: { deliverableId: deliverable.id }, _max: { position: true } });
    await prisma.deliverableCriterion.create({ data: { deliverableId: deliverable.id, text, position: (last._max.position ?? -1) + 1 } });
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });

  // La ruta de orden va antes que la de un criterio para que "order" no se tome como id.
  app.put<{ Params: Params }>(`${base}/:did/criteria/order`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findOpen(project.id, req.params.did);
    const { ids } = criteriaOrderSchema.parse(req.body);
    const current = await prisma.deliverableCriterion.findMany({ where: { deliverableId: deliverable.id }, select: { id: true } });
    const known = new Set(current.map((c) => c.id));
    if (new Set(ids).size !== ids.length || ids.length !== current.length || !ids.every((id) => known.has(id))) {
      throw fieldError('ids', 'La lista de criterios no coincide con la actual');
    }
    await prisma.$transaction(ids.map((id, position) => prisma.deliverableCriterion.update({ where: { id }, data: { position } })));
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });

  app.patch<{ Params: CriterionParams }>(`${base}/:did/criteria/:cid`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findOpen(project.id, req.params.did);
    const criterion = await findCriterion(deliverable.id, req.params.cid);
    const input = updateCriterionSchema.parse(req.body);
    await prisma.deliverableCriterion.update({ where: { id: criterion.id }, data: input });
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });

  app.delete<{ Params: CriterionParams }>(`${base}/:did/criteria/:cid`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const deliverable = await findOpen(project.id, req.params.did);
    const criterion = await findCriterion(deliverable.id, req.params.cid);
    await prisma.deliverableCriterion.delete({ where: { id: criterion.id } });
    return loadDeliverableDetail(prisma, deliverable.id, today());
  });
}
