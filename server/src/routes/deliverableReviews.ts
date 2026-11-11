import { canAccept, deliverableReviewSchema, localToday } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, fieldError } from '../errors';
import { findDeliverable, loadDeliverableDetail } from './deliverables';

/** Aceptar o rechazar un entregable en revisión, dejando constancia en su historial. */
export async function deliverableReviewRoutes(app: FastifyInstance) {
  const { prisma } = app;

  app.post<{ Params: { id: string; did: string } }>('/api/projects/:id/deliverables/:did/reviews', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const user = requireUser(req);
    const deliverable = await findDeliverable(prisma, project.id, req.params.did);
    const input = deliverableReviewSchema.parse(req.body);
    if (deliverable.status !== 'IN_REVIEW') throw new AppError(409, 'not_in_review', 'El entregable no está en revisión');

    const stakeholder = input.stakeholderId
      ? await prisma.stakeholder.findFirst({ where: { id: input.stakeholderId, projectId: project.id }, select: { name: true } })
      : null;
    if (input.stakeholderId && !stakeholder) throw fieldError('stakeholderId', 'El interesado no pertenece al proyecto');
    const attachment = input.attachmentId
      ? await prisma.attachment.findFirst({ where: { id: input.attachmentId, projectId: project.id }, select: { originalName: true } })
      : null;
    if (input.attachmentId && !attachment) throw fieldError('attachmentId', 'El anexo no pertenece al proyecto');

    const criteria = await prisma.deliverableCriterion.findMany({ where: { deliverableId: deliverable.id }, orderBy: { position: 'asc' } });
    if (input.outcome === 'ACCEPTED' && !canAccept(criteria)) throw fieldError('criteria', 'Marca todos los criterios para poder aceptar');
    if (input.outcome === 'REJECTED' && !input.note.trim()) throw fieldError('note', 'Escribe el motivo del rechazo');

    await prisma.$transaction([
      prisma.deliverableReview.create({
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
          createdAt: app.now(),
        },
      }),
      prisma.deliverable.update({ where: { id: deliverable.id }, data: { status: input.outcome } }),
    ]);
    return loadDeliverableDetail(prisma, deliverable.id, localToday(app.now()));
  });
}
