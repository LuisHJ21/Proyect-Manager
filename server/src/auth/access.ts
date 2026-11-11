import type { Project } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { forbidden, notFound } from '../errors';
import { requireUser } from './guards';

export async function getProjectAccess(req: FastifyRequest, projectId: string): Promise<{ project: Project; isPm: boolean }> {
  const user = requireUser(req);
  const { prisma } = req.server;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Proyecto no encontrado');
  const isPm = user.role === 'PM';
  if (!isPm) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
    if (!member) throw notFound('Proyecto no encontrado');
  }
  return { project, isPm };
}

export async function requireProjectPm(req: FastifyRequest, projectId: string): Promise<Project> {
  const { project, isPm } = await getProjectAccess(req, projectId);
  if (!isPm) throw forbidden();
  return project;
}

export function toProjectDto(project: Project, isPm: boolean) {
  // Los contadores de cambios, incidentes y decisiones son internos: no se envían a nadie.
  const { plannedBudgetCents, currency, lastChangeNumber: _c, lastIncidentNumber: _i, lastDecisionNumber: _d, ...visible } = project;
  return isPm ? { ...visible, plannedBudgetCents: Number(plannedBudgetCents), currency } : visible;
}
