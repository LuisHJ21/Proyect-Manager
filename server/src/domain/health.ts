import { ACTIVE_PROJECT_STATUS, type Health } from '@pm/shared';
import { averageProgress, HIGH_RISK_SCORE } from './indicators';

const AT_RISK_OVERDUE_TASKS = 3;
const ATTENTION_BUDGET_RATIO = 0.9;

export type HealthInput = {
  status: string;
  endDate: string | null;
  plannedBudgetCents: number;
  spentCents: number;
  overdueTasks: number;
  highRisks: number;
};

export const isActiveProject = (status: string) => (ACTIVE_PROJECT_STATUS as readonly string[]).includes(status);

export const isOverdue = (task: { status: string; dueDate: string | null }, today: string) =>
  task.status !== 'DONE' && task.dueDate !== null && task.dueDate < today;

export const isHighRisk = (risk: { probability: number; impact: number; status: string }) =>
  risk.status !== 'CLOSED' && risk.probability * risk.impact >= HIGH_RISK_SCORE;

/** Única fuente de las reglas de salud. Las condiciones se evalúan en orden. */
export function computeHealth(input: HealthInput, today: string): Health | null {
  if (!isActiveProject(input.status)) return null;
  const hasBudget = input.plannedBudgetCents > 0;
  const overBudget = hasBudget && input.spentCents > input.plannedBudgetCents;
  if ((input.endDate !== null && input.endDate < today) || overBudget || input.overdueTasks >= AT_RISK_OVERDUE_TASKS) {
    return 'AT_RISK';
  }
  const nearBudget = hasBudget && input.spentCents >= input.plannedBudgetCents * ATTENTION_BUDGET_RATIO;
  if (input.overdueTasks > 0 || input.highRisks > 0 || nearBudget) return 'ATTENTION';
  return 'ON_TRACK';
}

export type SummaryProject = { status: string; endDate: string | null; plannedBudgetCents: number };
export type SummaryTask = { status: string; dueDate: string | null; progress: number };
export type SummaryRisk = { probability: number; impact: number; status: string };
export type SummaryExpense = { amountCents: number };

export function summarizeProject(project: SummaryProject, tasks: SummaryTask[], risks: SummaryRisk[], expenses: SummaryExpense[], today: string) {
  const overdueTasks = tasks.filter((t) => isOverdue(t, today)).length;
  const highRisks = risks.filter(isHighRisk).length;
  const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  return {
    progress: averageProgress(tasks.map((t) => t.progress)),
    overdueTasks,
    highRisks,
    spentCents,
    health: computeHealth({ ...project, spentCents, overdueTasks, highRisks }, today),
  };
}

export type ProjectSummary = ReturnType<typeof summarizeProject>;
