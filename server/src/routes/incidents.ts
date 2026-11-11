import { createIncidentSchema, localToday, reportIncidentSchema, toPlainText, updateIncidentSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { incidentAccess, isIncidentOverdue, truncateTitle, type IncidentViewer } from '../domain/incidents';
import { HIGH_RISK_SCORE } from '../domain/indicators';
import { fieldError, forbidden, notFound } from '../errors';
import { createDecision } from './decisions';

type ItemParams = { id: string; incidentId: string };

export const incidentInclude = {
  reportedBy: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  risk: { select: { id: true, description: true } },
} satisfies Prisma.IncidentInclude;

export type IncidentWithRelations = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

/** Forma pública de un incidente para quien consulta: el riesgo de origen solo lo ve el PM. */
export function toIncidentDto(incident: IncidentWithRelations, viewer: IncidentViewer, today: string) {
  const { projectId: _p, reportedById: _r, ownerId: _o, taskId: _t, riskId: _k, updatedAt: _u, risk, ...fields } = incident;
  const access = incidentAccess(incident, viewer);
  return {
    ...fields,
    overdue: isIncidentOverdue(incident, today),
    risk: viewer.isPm && risk ? { id: risk.id, title: truncateTitle(toPlainText(risk.description)) } : null,
    can: { edit: access.edit, changeStatus: access.changeStatus, close: access.close },
  };
}

/** Comprueba que el responsable, la tarea y el riesgo sean del proyecto. */
export async function assertIncidentLinks(prisma: PrismaClient, projectId: string, input: { ownerId?: string | null; taskId?: string | null; riskId?: string | null }) {
  if (input.ownerId) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: input.ownerId } } });
    if (!member) throw fieldError('ownerId', 'El responsable debe ser miembro del proyecto');
  }
  if (input.taskId && !(await prisma.task.findFirst({ where: { id: input.taskId, projectId }, select: { id: true } }))) {
    throw fieldError('taskId', 'La tarea no pertenece al proyecto');
  }
  if (input.riskId && !(await prisma.risk.findFirst({ where: { id: input.riskId, projectId }, select: { id: true } }))) {
    throw fieldError('riskId', 'El riesgo no pertenece al proyecto');
  }
}

/** Crea un incidente con el siguiente número del proyecto. */
export function createIncident(prisma: PrismaClient, projectId: string, data: Omit<Prisma.IncidentUncheckedCreateInput, 'projectId' | 'number'>) {
  return prisma.$transaction(async (tx) => {
    const { lastIncidentNumber } = await tx.project.update({
      where: { id: projectId },
      data: { lastIncidentNumber: { increment: 1 } },
      select: { lastIncidentNumber: true },
    });
    return tx.incident.create({ data: { ...data, projectId, number: lastIncidentNumber }, include: incidentInclude });
  });
}

const hasKey = (body: unknown, key: string) => Boolean(body && typeof body === 'object' && key in body);

export async function incidentRoutes(app: FastifyInstance) {
  const { prisma } = app;
  const base = '/api/projects/:id/incidents';

  const viewerOf = async (req: FastifyRequest, projectId: string) => {
    const { project, isPm } = await getProjectAccess(req, projectId);
    return { project, viewer: { userId: requireUser(req).id, isPm } satisfies IncidentViewer };
  };

  const loadVisible = async (req: FastifyRequest, projectId: string, incidentId: string) => {
    const { project, viewer } = await viewerOf(req, projectId);
    const incident = await prisma.incident.findFirst({ where: { id: incidentId, projectId: project.id }, include: incidentInclude });
    if (!incident || !incidentAccess(incident, viewer).view) throw notFound('Incidente no encontrado');
    return { project, viewer, incident };
  };

  const today = () => localToday(app.now());

  app.get<{ Params: { id: string }; Querystring: { status?: string; mine?: string } }>(base, async (req) => {
    const { project, viewer } = await viewerOf(req, req.params.id);
    const mine = { OR: [{ reportedById: viewer.userId }, { ownerId: viewer.userId }] };
    const where: Prisma.IncidentWhereInput = {
      projectId: project.id,
      ...(req.query.status ? { status: req.query.status } : {}),
      ...(!viewer.isPm || req.query.mine === '1' ? mine : {}),
    };
    const incidents = await prisma.incident.findMany({ where, include: incidentInclude, orderBy: { number: 'desc' } });
    return incidents.map((i) => toIncidentDto(i, viewer, today()));
  });

  app.get<{ Params: ItemParams }>(`${base}/:incidentId`, async (req) => {
    const { viewer, incident } = await loadVisible(req, req.params.id, req.params.incidentId);
    return toIncidentDto(incident, viewer, today());
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const { project, viewer } = await viewerOf(req, req.params.id);
    const allowed = ['title', 'description', 'taskId'];
    if (!viewer.isPm && req.body && typeof req.body === 'object' && Object.keys(req.body).some((k) => !allowed.includes(k))) {
      throw forbidden('Solo el Project Manager puede fijar responsable, prioridad, fecha o riesgo');
    }
    const input = viewer.isPm ? createIncidentSchema.parse(req.body) : reportIncidentSchema.parse(req.body);
    await assertIncidentLinks(prisma, project.id, input);
    const created = await createIncident(prisma, project.id, { ...input, reportedById: viewer.userId });
    return reply.status(201).send(toIncidentDto(created, viewer, today()));
  });

  app.patch<{ Params: ItemParams }>(`${base}/:incidentId`, async (req) => {
    const { project, viewer, incident } = await loadVisible(req, req.params.id, req.params.incidentId);
    const access = incidentAccess(incident, viewer);
    const body = req.body;
    if (!access.edit && body && typeof body === 'object' && Object.keys(body).some((k) => k !== 'status' && k !== 'resolution')) {
      throw forbidden('Solo el Project Manager puede cambiar esos datos');
    }
    const { recordDecision, ...input } = updateIncidentSchema.parse(body);
    const nextStatus = input.status ?? incident.status;
    const statusChanged = nextStatus !== incident.status;
    if (statusChanged && (nextStatus === 'CLOSED' || incident.status === 'CLOSED') && !access.close) {
      throw forbidden('Solo el Project Manager puede cerrar o reabrir un incidente');
    }
    if ((statusChanged || hasKey(body, 'resolution')) && !access.changeStatus) {
      throw forbidden('Solo el responsable o el Project Manager pueden cambiar el estado');
    }
    const resolution = input.resolution ?? incident.resolution;
    if (nextStatus === 'RESOLVED' && !resolution.trim()) throw fieldError('resolution', 'Escribe la resolución');
    if (recordDecision && !(statusChanged && nextStatus === 'CLOSED')) {
      throw fieldError('recordDecision', 'Solo se registra una decisión al cerrar el incidente');
    }
    await assertIncidentLinks(prisma, project.id, input);

    const now = app.now();
    const dates: Prisma.IncidentUncheckedUpdateInput = {};
    if (statusChanged) {
      if (nextStatus === 'RESOLVED') dates.resolvedAt = now;
      else if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') dates.resolvedAt = nextStatus === 'CLOSED' ? incident.resolvedAt : null;
      if (nextStatus === 'CLOSED') dates.closedAt = now;
      else if (incident.status === 'CLOSED') dates.closedAt = null;
    }
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.incident.update({ where: { id: incident.id }, data: { ...input, ...dates }, include: incidentInclude });
      if (recordDecision) {
        // Deja constancia del cierre en el registro de decisiones del proyecto.
        await createDecision(tx, project.id, {
          title: truncateTitle(`Cierre de INC-${saved.number}: ${saved.title}`),
          rationale: saved.resolution,
          decidedBy: requireUser(req).name,
          decidedOn: today(),
          incidentId: saved.id,
        });
      }
      return saved;
    });
    return toIncidentDto(updated, viewer, today());
  });

  app.post<{ Params: { id: string; riskId: string } }>('/api/projects/:id/risks/:riskId/incident', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const risk = await prisma.risk.findFirst({ where: { id: req.params.riskId, projectId: project.id } });
    if (!risk) throw notFound('Riesgo no encontrado');
    const viewer = { userId: requireUser(req).id, isPm: true };
    const created = await createIncident(prisma, project.id, {
      title: truncateTitle(toPlainText(risk.description)) || 'Riesgo materializado',
      riskId: risk.id,
      ownerId: risk.ownerId,
      priority: risk.probability * risk.impact >= HIGH_RISK_SCORE ? 'HIGH' : 'MEDIUM',
      reportedById: viewer.userId,
    });
    return reply.status(201).send(toIncidentDto(created, viewer, today()));
  });

  app.delete<{ Params: ItemParams }>(`${base}/:incidentId`, async (req) => {
    const { viewer, incident } = await loadVisible(req, req.params.id, req.params.incidentId);
    if (!incidentAccess(incident, viewer).edit) throw forbidden();
    await prisma.incident.delete({ where: { id: incident.id } });
    return { ok: true };
  });
}
