import { addDays, isDeliverableOverdue, toPlainText, type Health } from '@pm/shared';
import { DEFAULT_THRESHOLDS, isActiveProject, isHighRisk, isOverdue, summarizeProject, type EvmIndexes, type HealthThresholds } from './health';
import { isIncidentOverdue } from './incidents';
import { weekStart, weeklyLoad } from './workload';

const MAX_ATTENTION_ITEMS = 8;
const UPCOMING_MILESTONE_DAYS = 14;
const HEALTH_ORDER: Record<Health, number> = { AT_RISK: 0, ATTENTION: 1, ON_TRACK: 2 };

export type Person = { id: string; name: string };
export type DashboardInput = {
  projects: { id: string; name: string; status: string; endDate: string | null; plannedBudgetCents: number; team: Person[]; evm?: EvmIndexes; reportDue?: boolean; thresholds?: HealthThresholds }[];
  tasks: {
    id: string;
    title: string;
    projectId: string;
    status: string;
    progress: number;
    plannedCostCents: number;
    estimatedHours?: number | null;
    startDate: string | null;
    dueDate: string | null;
    assignees: (Person & { role: string; active: boolean })[];
  }[];
  risks: { id: string; description: string; projectId: string; probability: number; impact: number; status: string }[];
  expenses: { projectId: string; amountCents: number }[];
  milestones: { id: string; name: string; dueDate: string; status: string; projectId: string }[];
  incidents?: { id: string; number: number; title: string; projectId: string; priority: string; status: string; dueDate: string | null }[];
  deliverables?: { id: string; number: number; name: string; projectId: string; status: string; dueDate: string | null }[];
  /** Capacidad semanal de cada persona en cada proyecto activo; se suma entre proyectos. */
  capacities?: { userId: string; hours: number }[];
  /** Solicitudes aprobadas que aún no se aplicaron. */
  changes?: { id: string; number: number; title: string; projectId: string }[];
};

/** Fechas vacías al final. */
export const compareDates = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
};

export function buildDashboard(input: DashboardInput, today: string) {
  const projects = input.projects.filter((p) => isActiveProject(p.status));
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const inScope = <T extends { projectId: string }>(items: T[]) => items.filter((item) => names.has(item.projectId));
  const tasks = inScope(input.tasks);
  const risks = inScope(input.risks);
  const expenses = inScope(input.expenses);
  const projectName = (id: string) => names.get(id) ?? '';

  const summaries = projects.map((project) => ({
    project,
    summary: summarizeProject(
      project,
      tasks.filter((t) => t.projectId === project.id),
      risks.filter((r) => r.projectId === project.id),
      expenses.filter((e) => e.projectId === project.id),
      today,
      project.evm,
      project.thresholds,
    ),
  }));

  const overdue = tasks.filter((t) => isOverdue(t, today));
  const thresholdOf = new Map(projects.map((p) => [p.id, (p.thresholds ?? DEFAULT_THRESHOLDS).highRiskScore]));
  const highRisks = risks.filter((r) => isHighRisk(r, thresholdOf.get(r.projectId)));
  // Incidentes urgentes: abiertos o en curso, de prioridad alta o vencidos. Primero los vencidos.
  const urgentIncidents = inScope(input.incidents ?? [])
    .map((i) => ({ ...i, overdue: isIncidentOverdue(i, today) }))
    .filter((i) => (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && (i.priority === 'HIGH' || i.overdue))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.number - b.number);

  // Entregables vencidos: primero los de fecha más antigua.
  const overdueDeliverables = inScope(input.deliverables ?? [])
    .filter((d) => isDeliverableOverdue(d, today))
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.number - b.number);

  const attention = [
    ...[...overdue]
      .sort((a, b) => compareDates(a.dueDate, b.dueDate))
      .map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, projectId: t.projectId, projectName: projectName(t.projectId), dueDate: t.dueDate })),
    ...urgentIncidents.map((i) => ({
      kind: 'incident' as const,
      id: i.id,
      number: i.number,
      title: i.title,
      projectId: i.projectId,
      projectName: projectName(i.projectId),
      priority: i.priority,
      dueDate: i.dueDate,
      overdue: i.overdue,
    })),
    ...overdueDeliverables.map((d) => ({
      kind: 'deliverable' as const,
      id: d.id,
      number: d.number,
      title: d.name,
      projectId: d.projectId,
      projectName: projectName(d.projectId),
      dueDate: d.dueDate,
    })),
    ...inScope(input.changes ?? [])
      .sort((a, b) => a.number - b.number)
      .map((cr) => ({ kind: 'change' as const, id: cr.id, number: cr.number, title: cr.title, projectId: cr.projectId, projectName: projectName(cr.projectId) })),
    ...input.projects
      .filter((p) => p.reportDue)
      .map((p) => ({ kind: 'report' as const, id: p.id, title: 'Toca emitir el informe de estado', projectId: p.id, projectName: p.name })),
    ...[...highRisks]
      .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
      .map((r) => ({ kind: 'risk' as const, id: r.id, title: toPlainText(r.description), projectId: r.projectId, projectName: projectName(r.projectId), score: r.probability * r.impact })),
  ].slice(0, MAX_ATTENTION_ITEMS);

  // Semana actual y las 3 siguientes: horas asignadas frente a capacidad.
  const weeks = [0, 7, 14, 21].map((offset) => addDays(weekStart(today), offset));
  const hours = weeklyLoad(
    tasks.map((t) => ({ ...t, estimatedHours: t.estimatedHours ?? null, assigneeIds: t.assignees.filter((a) => a.active).map((a) => a.id) })),
    weeks,
  );
  const capacity = new Map<string, number>();
  for (const c of input.capacities ?? []) capacity.set(c.userId, (capacity.get(c.userId) ?? 0) + c.hours);
  const weeksOf = (userId: string) =>
    weeks.map((start, i) => {
      const assignedHours = Math.round((hours.get(userId)?.[i] ?? 0) * 10) / 10;
      const capacityHours = capacity.get(userId) ?? 0;
      return { start, assignedHours, capacityHours, overloaded: assignedHours > capacityHours };
    });

  const load = new Map<string, { userId: string; name: string; openTasks: number; overdueTasks: number }>();
  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    for (const person of task.assignees) {
      if (!person.active) continue;
      const entry = load.get(person.id) ?? { userId: person.id, name: person.name, openTasks: 0, overdueTasks: 0 };
      entry.openTasks += 1;
      if (isOverdue(task, today)) entry.overdueTasks += 1;
      load.set(person.id, entry);
    }
  }

  const horizon = addDays(today, UPCOMING_MILESTONE_DAYS);

  return {
    totals: {
      activeProjects: projects.length,
      atRiskProjects: summaries.filter((s) => s.summary.health === 'AT_RISK').length,
      overdueTasks: overdue.length,
      overdueProjects: new Set(overdue.map((t) => t.projectId)).size,
      highRisks: highRisks.length,
      overBudgetProjects: summaries.filter((s) => s.project.plannedBudgetCents > 0 && s.summary.spentCents > s.project.plannedBudgetCents).length,
    },
    projects: summaries
      .sort(
        (a, b) =>
          HEALTH_ORDER[a.summary.health!] - HEALTH_ORDER[b.summary.health!] || compareDates(a.project.endDate, b.project.endDate),
      )
      .map(({ project, summary }) => ({
        id: project.id,
        name: project.name,
        progress: summary.progress,
        endDate: project.endDate,
        health: summary.health,
        team: project.team,
      })),
    attention,
    workload: [...load.values()].map((entry) => ({ ...entry, weeks: weeksOf(entry.userId) })).sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name)),
    upcomingMilestones: inScope(input.milestones)
      .filter((m) => m.status === 'PENDING' && m.dueDate >= today && m.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate, projectId: m.projectId, projectName: projectName(m.projectId) })),
  };
}
