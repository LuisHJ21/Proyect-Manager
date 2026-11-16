import { ACTIVE_PROJECT_STATUS, type Health } from '@pm/shared';
import { HIGH_RISK_SCORE, weightedProgress, type ProgressTask } from './indicators';

/**
 * Umbrales de salud de un proyecto (F16): tareas vencidas para «En riesgo», porcentaje del presupuesto
 * y CPI/SPI mínimo (en centésimas) para «Atención», y puntaje desde el que un riesgo es alto.
 */
export type HealthThresholds = { overdueTasks: number; budgetPercent: number; indexMin: number; highRiskScore: number };
export const DEFAULT_THRESHOLDS: HealthThresholds = { overdueTasks: 3, budgetPercent: 90, indexMin: 90, highRiskScore: HIGH_RISK_SCORE };
export const thresholdsOf = (p: { healthOverdueTasks?: number; healthBudgetPercent?: number; healthIndexMin?: number; highRiskScore?: number }): HealthThresholds => ({
  overdueTasks: p.healthOverdueTasks ?? DEFAULT_THRESHOLDS.overdueTasks,
  budgetPercent: p.healthBudgetPercent ?? DEFAULT_THRESHOLDS.budgetPercent,
  indexMin: p.healthIndexMin ?? DEFAULT_THRESHOLDS.indexMin,
  highRiskScore: p.highRiskScore ?? DEFAULT_THRESHOLDS.highRiskScore,
});

export type HealthInput = {
  status: string;
  endDate: string | null;
  plannedBudgetCents: number;
  spentCents: number;
  overdueTasks: number;
  highRisks: number;
  /** Índices de valor ganado; solo existen si el proyecto tiene línea base. */
  cpi?: number | null;
  spi?: number | null;
};

export const isActiveProject = (status: string) => (ACTIVE_PROJECT_STATUS as readonly string[]).includes(status);

export const isOverdue = (task: { status: string; dueDate: string | null }, today: string) =>
  task.status !== 'DONE' && task.dueDate !== null && task.dueDate < today;

export const isHighRisk = (risk: { probability: number; impact: number; status: string }, score: number = HIGH_RISK_SCORE) =>
  risk.status !== 'CLOSED' && risk.probability * risk.impact >= score;

/** Única fuente de las reglas de salud. Las condiciones se evalúan en orden. */
export function computeHealth(input: HealthInput, today: string, t: HealthThresholds = DEFAULT_THRESHOLDS): Health | null {
  if (!isActiveProject(input.status)) return null;
  const hasBudget = input.plannedBudgetCents > 0;
  const overBudget = hasBudget && input.spentCents > input.plannedBudgetCents;
  if ((input.endDate !== null && input.endDate < today) || overBudget || input.overdueTasks >= t.overdueTasks) {
    return 'AT_RISK';
  }
  const nearBudget = hasBudget && input.spentCents >= (input.plannedBudgetCents * t.budgetPercent) / 100;
  const lowIndex = [input.cpi, input.spi].some((value) => value !== null && value !== undefined && value < t.indexMin / 100);
  if (input.overdueTasks > 0 || input.highRisks > 0 || nearBudget || lowIndex) return 'ATTENTION';
  return 'ON_TRACK';
}

export type SummaryProject = { status: string; endDate: string | null; plannedBudgetCents: number };
export type SummaryTask = { status: string } & ProgressTask;
export type SummaryRisk = { probability: number; impact: number; status: string };
export type SummaryExpense = { amountCents: number };

export type EvmIndexes = { cpi: number | null; spi: number | null };

export function summarizeProject(
  project: SummaryProject,
  tasks: SummaryTask[],
  risks: SummaryRisk[],
  expenses: SummaryExpense[],
  today: string,
  evm?: EvmIndexes,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS,
) {
  const overdueTasks = tasks.filter((t) => isOverdue(t, today)).length;
  const highRisks = risks.filter((r) => isHighRisk(r, thresholds.highRiskScore)).length;
  const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  return {
    progress: weightedProgress(tasks),
    overdueTasks,
    highRisks,
    spentCents,
    health: computeHealth({ ...project, spentCents, overdueTasks, highRisks, cpi: evm?.cpi, spi: evm?.spi }, today, thresholds),
  };
}

export type ProjectSummary = ReturnType<typeof summarizeProject>;
