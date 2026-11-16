import { accessLevel, type AccessLevel, type Role, type Section } from '@pm/shared';
import type { Project } from '@prisma/client';
import { forbidden, notFound } from '../errors';
import type { Ctx } from '../http';
import { requireUser } from './guards';

export type ProjectCan = { read(s: Section): boolean; write(s: Section): boolean; level(s: Section): AccessLevel };
export type ProjectAccess = { project: Project; role: Role; isPm: boolean; can: ProjectCan };

export function capabilitiesOf(role: Role): ProjectCan {
  return {
    level: (s) => accessLevel(role, s),
    read: (s) => accessLevel(role, s) !== 'none',
    write: (s) => accessLevel(role, s) === 'write',
  };
}

/** El PM ve todo proyecto; los demás perfiles deben ser miembros o reciben 404. */
export async function getProjectAccess(c: Ctx, projectId: string): Promise<ProjectAccess> {
  const user = requireUser(c);
  const { prisma } = c.var.deps;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Proyecto no encontrado');
  const role = user.role as Role;
  const isPm = role === 'PM';
  if (!isPm) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
    if (!member) throw notFound('Proyecto no encontrado');
  }
  return { project, role, isPm, can: capabilitiesOf(role) };
}

/** 403 si el perfil no alcanza el nivel pedido en la sección. Con `read`, el nivel `own` pasa: la ruta filtra. */
export async function requireProjectAccess(c: Ctx, projectId: string, section: Section, need: 'read' | 'write'): Promise<Project> {
  const { project, can } = await getProjectAccess(c, projectId);
  if (need === 'write' ? !can.write(section) : !can.read(section)) throw forbidden();
  return project;
}

export function toProjectDto(project: Project, isPm: boolean) {
  // Los contadores de cambios, incidentes y decisiones son internos: no se envían a nadie.
  const { plannedBudgetCents, contingencyReserveCents, managementReserveCents, currency, lastChangeNumber: _c, lastIncidentNumber: _i, lastDecisionNumber: _d, lastDeliverableNumber: _e, lastStatusReportNumber: _r, lastRequirementNumber: _q, lastAssumptionNumber: _a, healthOverdueTasks, healthBudgetPercent, healthIndexMin, highRiskScore, ...visible } = project;
  // Presupuesto, reservas y umbrales de salud son del PM.
  return isPm
    ? {
        ...visible,
        plannedBudgetCents: Number(plannedBudgetCents),
        contingencyReserveCents: Number(contingencyReserveCents),
        managementReserveCents: Number(managementReserveCents),
        currency,
        healthOverdueTasks,
        healthBudgetPercent,
        healthIndexMin,
        highRiskScore,
      }
    : visible;
}
