import type { Project } from '@prisma/client';
import { forbidden, notFound } from '../errors';
import type { Ctx } from '../http';
import { requireUser } from './guards';

export async function getProjectAccess(c: Ctx, projectId: string): Promise<{ project: Project; isPm: boolean }> {
  const user = requireUser(c);
  const { prisma } = c.var.deps;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Proyecto no encontrado');
  const isPm = user.role === 'PM';
  if (!isPm) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
    if (!member) throw notFound('Proyecto no encontrado');
  }
  return { project, isPm };
}

export async function requireProjectPm(c: Ctx, projectId: string): Promise<Project> {
  const { project, isPm } = await getProjectAccess(c, projectId);
  if (!isPm) throw forbidden();
  return project;
}

export function toProjectDto(project: Project, isPm: boolean) {
  // Los contadores de cambios, incidentes y decisiones son internos: no se envían a nadie.
  const { plannedBudgetCents, currency, lastChangeNumber: _c, lastIncidentNumber: _i, lastDecisionNumber: _d, lastDeliverableNumber: _e, ...visible } = project;
  return isPm ? { ...visible, plannedBudgetCents: Number(plannedBudgetCents), currency } : visible;
}
