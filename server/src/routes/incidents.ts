import { createIncidentSchema, localToday, reportIncidentSchema, toPlainText, updateIncidentSchema } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, readQuery, type App, type Ctx } from '../http';
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

export function incidentRoutes(app: App) {
  const base = '/api/projects/:id/incidents';

  const viewerOf = async (c: Ctx, projectId: string) => {
    const { project, isPm } = await getProjectAccess(c, projectId);
    return { project, viewer: { userId: requireUser(c).id, isPm } satisfies IncidentViewer };
  };

  const loadVisible = async (c: Ctx, projectId: string, incidentId: string) => {
    const { project, viewer } = await viewerOf(c, projectId);
    const incident = await c.var.deps.prisma.incident.findFirst({ where: { id: incidentId, projectId: project.id }, include: incidentInclude });
    if (!incident || !incidentAccess(incident, viewer).view) throw notFound('Incidente no encontrado');
    return { project, viewer, incident };
  };

  const today = (c: Ctx) => localToday(c.var.deps.now());

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project, viewer } = await viewerOf(c, c.req.param('id'));
    const query = readQuery(c) as { status?: string; mine?: string };
    const mine = { OR: [{ reportedById: viewer.userId }, { ownerId: viewer.userId }] };
    const where: Prisma.IncidentWhereInput = {
      projectId: project.id,
      ...(query.status ? { status: query.status } : {}),
      ...(!viewer.isPm || query.mine === '1' ? mine : {}),
    };
    const incidents = await prisma.incident.findMany({ where, include: incidentInclude, orderBy: { number: 'desc' } });
    return c.json(incidents.map((i) => toIncidentDto(i, viewer, today(c))));
  });

  app.get(`${base}/:incidentId`, async (c) => {
    const { viewer, incident } = await loadVisible(c, c.req.param('id'), c.req.param('incidentId'));
    return c.json(toIncidentDto(incident, viewer, today(c)));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project, viewer } = await viewerOf(c, c.req.param('id'));
    const allowed = ['title', 'description', 'taskId'];
    const body = await readBody(c);
    if (!viewer.isPm && body && typeof body === 'object' && Object.keys(body).some((k) => !allowed.includes(k))) {
      throw forbidden('Solo el Project Manager puede fijar responsable, prioridad, fecha o riesgo');
    }
    const input = viewer.isPm ? createIncidentSchema.parse(body) : reportIncidentSchema.parse(body);
    await assertIncidentLinks(prisma, project.id, input);
    const created = await createIncident(prisma, project.id, { ...input, reportedById: viewer.userId });
    return c.json(toIncidentDto(created, viewer, today(c)), 201);
  });

  app.patch(`${base}/:incidentId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project, viewer, incident } = await loadVisible(c, c.req.param('id'), c.req.param('incidentId'));
    const access = incidentAccess(incident, viewer);
    const body = await readBody(c);
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

    const now = c.var.deps.now();
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
          decidedBy: requireUser(c).name,
          decidedOn: today(c),
          incidentId: saved.id,
        });
      }
      return saved;
    });
    return c.json(toIncidentDto(updated, viewer, today(c)));
  });

  app.post('/api/projects/:id/risks/:riskId/incident', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectPm(c, c.req.param('id'));
    const risk = await prisma.risk.findFirst({ where: { id: c.req.param('riskId'), projectId: project.id } });
    if (!risk) throw notFound('Riesgo no encontrado');
    const viewer = { userId: requireUser(c).id, isPm: true };
    const created = await createIncident(prisma, project.id, {
      title: truncateTitle(toPlainText(risk.description)) || 'Riesgo materializado',
      riskId: risk.id,
      ownerId: risk.ownerId,
      priority: risk.probability * risk.impact >= HIGH_RISK_SCORE ? 'HIGH' : 'MEDIUM',
      reportedById: viewer.userId,
    });
    return c.json(toIncidentDto(created, viewer, today(c)), 201);
  });

  app.delete(`${base}/:incidentId`, async (c) => {
    const { prisma } = c.var.deps;
    const { viewer, incident } = await loadVisible(c, c.req.param('id'), c.req.param('incidentId'));
    if (!incidentAccess(incident, viewer).edit) throw forbidden();
    await prisma.incident.delete({ where: { id: incident.id } });
    return c.json({ ok: true });
  });
}
