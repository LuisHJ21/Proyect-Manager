import { canAccept, deliverableReviewSchema } from '@pm/shared';
import { readBody, type App, type Ctx } from '../http';
import { requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, fieldError } from '../errors';
import { sanitizeRichText } from '../richText';
import { findDeliverable, loadDeliverableDetail } from './deliverables';
import { createIncidentIn } from './incidents';

/** Aceptar o rechazar un entregable en revisión, dejando constancia en su historial. */
export function deliverableReviewRoutes(app: App) {

  app.post('/api/projects/:id/deliverables/:did/reviews', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'deliverables', 'write');
    const user = requireUser(c);
    const deliverable = await findDeliverable(prisma, project.id, c.req.param('did'));
    const input = deliverableReviewSchema.parse(await readBody(c));
    if (deliverable.status !== 'IN_REVIEW') throw new AppError(409, 'not_in_review', 'El entregable no está en revisión');

    const stakeholder = input.stakeholderId
      ? await prisma.stakeholder.findFirst({ where: { id: input.stakeholderId, projectId: project.id }, select: { name: true } })
      : null;
    if (input.stakeholderId && !stakeholder) throw fieldError('stakeholderId', 'El interesado no pertenece al proyecto');
    const attachment = input.attachmentId
      ? await prisma.attachment.findFirst({ where: { id: input.attachmentId, projectId: project.id, uploadedAt: { not: null } }, select: { originalName: true } })
      : null;
    if (input.attachmentId && !attachment) throw fieldError('attachmentId', 'El anexo no pertenece al proyecto');

    const criteria = await prisma.deliverableCriterion.findMany({ where: { deliverableId: deliverable.id }, orderBy: { position: 'asc' } });
    if (input.outcome === 'ACCEPTED' && !canAccept(criteria)) throw fieldError('criteria', 'Marca todos los criterios para poder aceptar');
    if (input.outcome === 'REJECTED' && !input.note.trim()) throw fieldError('note', 'Escribe el motivo del rechazo');

    // La revisión, el estado y la no conformidad (si se pide) se guardan juntos o nada.
    const nonconformity = await prisma.$transaction(async (tx) => {
      await tx.deliverableReview.create({
        data: {
          deliverableId: deliverable.id,
          outcome: input.outcome,
          stakeholderId: input.stakeholderId ?? null,
          stakeholderName: stakeholder?.name ?? '',
          reviewedOn: input.reviewedOn,
          note: input.note.trim(),
          attachmentId: input.attachmentId ?? null,
          attachmentName: attachment?.originalName ?? '',
          criteria: JSON.stringify(criteria.map((c) => ({ text: c.text, met: c.met }))),
          reviewedById: user.id,
          createdAt: c.var.deps.now(),
        },
      });
      await tx.deliverable.update({ where: { id: deliverable.id }, data: { status: input.outcome, version: { increment: 1 } } });
      if (!input.nonconformity) return null;
      const incident = await createIncidentIn(tx, project.id, {
        title: input.nonconformity.title,
        description: sanitizeRichText(input.note.trim()),
        kind: 'NONCONFORMITY',
        deliverableId: deliverable.id,
        priority: 'HIGH',
        reportedById: user.id,
      });
      return { id: incident.id, number: incident.number };
    });
    return c.json({ ...(await loadDeliverableDetail(prisma, deliverable.id, c.var.deps.today())), nonconformity });
  });
}
