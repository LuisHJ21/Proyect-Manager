import { createRequirementSchema, updateRequirementSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { suggestMet } from '../domain/traceability';
import { editConflict, fieldError, forbidden, notFound } from '../errors';
import { sanitizeRichText } from '../richText';

export const requirementInclude = {
  stakeholder: { select: { id: true, name: true } },
  deliverables: { include: { deliverable: { select: { id: true, number: true, name: true, status: true } } } },
} satisfies Prisma.RequirementInclude;
type RequirementRow = Prisma.RequirementGetPayload<{ include: typeof requirementInclude }>;

/** El interesado de origen solo va al PM. */
function toRequirementDto(r: RequirementRow, isPm: boolean) {
  const deliverables = r.deliverables.map((link) => link.deliverable).sort((a, b) => a.number - b.number);
  return {
    id: r.id,
    number: r.number,
    description: r.description,
    priority: r.priority,
    status: r.status,
    acceptance: r.acceptance,
    version: r.version,
    deliverables,
    ...(isPm ? { stakeholder: r.stakeholder } : {}),
    suggestMet: suggestMet({ status: r.status, deliverables }),
  };
}

/** Entregables e interesado deben ser del proyecto. Devuelve los entregables sin repetir. */
async function assertLinks(prisma: PrismaClient, projectId: string, input: { deliverableIds?: string[]; stakeholderId?: string | null }) {
  const deliverableIds = input.deliverableIds ? [...new Set(input.deliverableIds)] : undefined;
  if (deliverableIds && deliverableIds.length > 0) {
    const count = await prisma.deliverable.count({ where: { id: { in: deliverableIds }, projectId } });
    if (count !== deliverableIds.length) throw fieldError('deliverableIds', 'El entregable no pertenece a este proyecto');
  }
  if (input.stakeholderId && !(await prisma.stakeholder.findFirst({ where: { id: input.stakeholderId, projectId }, select: { id: true } }))) {
    throw fieldError('stakeholderId', 'El interesado no pertenece a este proyecto');
  }
  return deliverableIds;
}

export function requirementRoutes(app: App) {
  const base = '/api/projects/:id/requirements';

  const access = async (c: Ctx, need: 'read' | 'write') => {
    const result = await getProjectAccess(c, c.req.param('id')!);
    if (need === 'write' ? !result.can.write('requirements') : !result.can.read('requirements')) throw forbidden();
    return result;
  };
  const findRequirement = async (prisma: PrismaClient, projectId: string, id: string) => {
    const requirement = await prisma.requirement.findFirst({ where: { id, projectId } });
    if (!requirement) throw notFound('Requisito no encontrado');
    return requirement;
  };

  app.get(base, async (c) => {
    const { project, isPm } = await access(c, 'read');
    const items = await c.var.deps.prisma.requirement.findMany({ where: { projectId: project.id }, include: requirementInclude, orderBy: { number: 'asc' } });
    return c.json(items.map((r) => toRequirementDto(r, isPm)));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const { deliverableIds: rawIds, ...input } = createRequirementSchema.parse(await readBody(c));
    const deliverableIds = (await assertLinks(prisma, project.id, { deliverableIds: rawIds, stakeholderId: input.stakeholderId })) ?? [];
    const created = await prisma.$transaction(async (tx) => {
      const { lastRequirementNumber } = await tx.project.update({
        where: { id: project.id },
        data: { lastRequirementNumber: { increment: 1 } },
        select: { lastRequirementNumber: true },
      });
      return tx.requirement.create({
        data: {
          ...input,
          description: sanitizeRichText(input.description),
          projectId: project.id,
          number: lastRequirementNumber,
          deliverables: { create: deliverableIds.map((deliverableId) => ({ deliverableId })) },
        },
        include: requirementInclude,
      });
    });
    return c.json(toRequirementDto(created, true), 201);
  });

  app.patch(`${base}/:requirementId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const requirement = await findRequirement(prisma, project.id, c.req.param('requirementId'));
    const { version, deliverableIds: rawIds, ...input } = updateRequirementSchema.parse(await readBody(c));
    const deliverableIds = await assertLinks(prisma, project.id, { deliverableIds: rawIds, stakeholderId: input.stakeholderId });
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.requirement.updateMany({
        where: { id: requirement.id, version },
        data: { ...input, ...(input.description !== undefined ? { description: sanitizeRichText(input.description) } : {}), version: { increment: 1 } },
      });
      if (count === 0) throw editConflict();
      if (deliverableIds) {
        await tx.requirementDeliverable.deleteMany({ where: { requirementId: requirement.id } });
        await tx.requirementDeliverable.createMany({ data: deliverableIds.map((deliverableId) => ({ requirementId: requirement.id, deliverableId })) });
      }
    });
    return c.json(toRequirementDto(await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id }, include: requirementInclude }), true));
  });

  app.delete(`${base}/:requirementId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await access(c, 'write');
    const requirement = await findRequirement(prisma, project.id, c.req.param('requirementId'));
    await prisma.requirement.delete({ where: { id: requirement.id } });
    return c.json({ ok: true });
  });
}
