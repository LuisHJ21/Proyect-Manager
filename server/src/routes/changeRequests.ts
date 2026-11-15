import { changeRequestSchema, decisionSchema, proposeChangeSchema, updateChangeRequestSchema } from '@pm/shared';
import type { ChangeRequest, Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, forbidden, notFound } from '../errors';
import { notify } from '../notifications';

type ItemParams = { id: string; crId: string };

type Person = { id: string; name: string };
type ChangeRequestRow = ChangeRequest & { decidedBy: Person | null; requestedByUser: Person | null };

const decidedByInclude = {
  decidedBy: { select: { id: true, name: true } },
  requestedByUser: { select: { id: true, name: true } },
} as const;

/** Vista del PM: todo, más quién la propuso desde el equipo. */
export function toChangeRequestDto(cr: ChangeRequestRow) {
  const { projectId: _projectId, decidedById: _decidedById, requestedById: _requestedById, requestedByUser, costImpactCents, ...fields } = cr;
  return { ...fields, proposedBy: requestedByUser, costImpactCents: costImpactCents === null ? null : Number(costImpactCents) };
}

/** Vista de quien propuso: el estado y la decisión, sin impactos ni solicitante. */
function toProposalDto(cr: ChangeRequestRow) {
  const { id, number, title, description, status, decisionNote, decidedAt, decidedBy, createdAt } = cr;
  return { id, number, title, description, status, decisionNote, decidedAt, decidedBy, createdAt };
}

const PROPOSAL_FIELDS = ['title', 'description'];

/** Crea la solicitud con el siguiente número del proyecto. */
function createChangeRequest(prisma: PrismaClient, projectId: string, data: Omit<Prisma.ChangeRequestUncheckedCreateInput, 'projectId' | 'number'>) {
  return prisma.$transaction(async (tx) => {
    // El contador del proyecto evita reutilizar el número de una solicitud borrada.
    const { lastChangeNumber } = await tx.project.update({
      where: { id: projectId },
      data: { lastChangeNumber: { increment: 1 } },
      select: { lastChangeNumber: true },
    });
    return tx.changeRequest.create({ data: { ...data, number: lastChangeNumber, projectId }, include: decidedByInclude });
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
      const input = proposeChangeSchema.parse(body);
      const created = await createChangeRequest(prisma, project.id, { ...input, requestedById: user.id, requestedBy: user.name });
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
    const { costImpactCents, ...input } = changeRequestSchema.parse(body);
    const created = await createChangeRequest(prisma, project.id, { ...input, costImpactCents: toBigInt(costImpactCents) });
    return c.json(toChangeRequestDto(created), 201);
  });

  app.patch(`${base}/:crId`, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'changes', 'write');
    const cr = await findPending(c.var.deps.prisma, project.id, c.req.param('crId'));
    const { costImpactCents, ...input } = updateChangeRequestSchema.parse(await readBody(c));
    const updated = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { ...input, costImpactCents: toBigInt(costImpactCents) },
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
}
