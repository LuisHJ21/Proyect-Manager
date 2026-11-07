import { addDays, type Health } from '@pm/shared';
import { isActiveProject, isHighRisk, isOverdue, summarizeProject } from './health';

const MAX_ATTENTION_ITEMS = 8;
const UPCOMING_MILESTONE_DAYS = 14;
const HEALTH_ORDER: Record<Health, number> = { AT_RISK: 0, ATTENTION: 1, ON_TRACK: 2 };

export type Person = { id: string; name: string };
export type DashboardInput = {
  projects: { id: string; name: string; status: string; endDate: string | null; plannedBudgetCents: number; team: Person[] }[];
  tasks: {
    id: string;
    title: string;
    projectId: string;
    status: string;
    progress: number;
    dueDate: string | null;
    assignees: (Person & { role: string; active: boolean })[];
  }[];
  risks: { id: string; description: string; projectId: string; probability: number; impact: number; status: string }[];
  expenses: { projectId: string; amountCents: number }[];
  milestones: { id: string; name: string; dueDate: string; status: string; projectId: string }[];
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
    ),
  }));

  const overdue = tasks.filter((t) => isOverdue(t, today));
  const highRisks = risks.filter(isHighRisk);

  const attention = [
    ...[...overdue]
      .sort((a, b) => compareDates(a.dueDate, b.dueDate))
      .map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, projectId: t.projectId, projectName: projectName(t.projectId), dueDate: t.dueDate })),
    ...[...highRisks]
      .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
      .map((r) => ({ kind: 'risk' as const, id: r.id, title: r.description, projectId: r.projectId, projectName: projectName(r.projectId), score: r.probability * r.impact })),
  ].slice(0, MAX_ATTENTION_ITEMS);

  const load = new Map<string, { userId: string; name: string; openTasks: number; overdueTasks: number }>();
  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    for (const person of task.assignees) {
      if (!person.active || person.role !== 'COLLABORATOR') continue;
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
    workload: [...load.values()].sort((a, b) => b.openTasks - a.openTasks || a.name.localeCompare(b.name)),
    upcomingMilestones: inScope(input.milestones)
      .filter((m) => m.status === 'PENDING' && m.dueDate >= today && m.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate, projectId: m.projectId, projectName: projectName(m.projectId) })),
  };
}
