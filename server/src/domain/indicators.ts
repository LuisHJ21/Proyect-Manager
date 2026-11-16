import { addDays, diffDays } from '@pm/shared';

export type IndicatorsInput = {
  tasks: ({ status: string } & ProgressTask)[];
  milestones: { id: string; name: string; dueDate: string; status: string }[];
  /** Los siguientes datos solo se proporcionan para un Project Manager. */
  plannedBudgetCents?: number;
  expenses?: { amountCents: number }[];
  risks?: { probability: number; impact: number; status: string }[];
  /** Puntaje de riesgo alto del proyecto; por defecto HIGH_RISK_SCORE. */
  highRiskScore?: number;
};

export const HIGH_RISK_SCORE = 15;
const UPCOMING_MILESTONE_DAYS = 14;

export type ProgressTask = { progress: number; plannedCostCents: number; startDate: string | null; dueDate: string | null; estimatedHours?: number | null };

/** Días de la tarea contando el inicio y el fin; 1 si falta una fecha o están al revés. */
function durationDays(task: ProgressTask): number {
  if (!task.startDate || !task.dueDate) return 1;
  return Math.max(1, diffDays(task.startDate, task.dueDate) + 1);
}

/**
 * Avance del proyecto: cada tarea pesa por su costo planeado si todas lo tienen; si no, por su
 * duración. El peso se elige para todo el proyecto porque costo y duración no se pueden mezclar.
 */
export function weightedProgress(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;
  // Primero el esfuerzo estimado, luego el costo, luego la duración; nunca se mezclan.
  const byHours = tasks.every((t) => (t.estimatedHours ?? 0) > 0);
  const byCost = tasks.every((t) => t.plannedCostCents > 0);
  const weight = (t: ProgressTask) => (byHours ? t.estimatedHours! : byCost ? t.plannedCostCents : durationDays(t));
  const total = tasks.reduce((sum, t) => sum + weight(t), 0);
  return Math.round(tasks.reduce((sum, t) => sum + weight(t) * t.progress, 0) / total);
}

function computeBudget(plannedCents: number, expenses: { amountCents: number }[]) {
  const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  return { plannedCents, spentCents, differenceCents: plannedCents - spentCents };
}

export function computeIndicators(input: IndicatorsInput, today: string) {
  const horizon = addDays(today, UPCOMING_MILESTONE_DAYS);
  return {
    progress: weightedProgress(input.tasks),
    overdueTasks: input.tasks.filter((t) => t.dueDate !== null && t.dueDate < today && t.status !== 'DONE').length,
    blockedTasks: input.tasks.filter((t) => t.status === 'BLOCKED').length,
    upcomingMilestones: input.milestones
      .filter((m) => m.status === 'PENDING' && m.dueDate >= today && m.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(({ id, name, dueDate }) => ({ id, name, dueDate })),
    ...(input.plannedBudgetCents !== undefined ? { budget: computeBudget(input.plannedBudgetCents, input.expenses ?? []) } : {}),
    ...(input.risks
      ? { highRisks: input.risks.filter((r) => r.status !== 'CLOSED' && r.probability * r.impact >= (input.highRiskScore ?? HIGH_RISK_SCORE)).length }
      : {}),
  };
}

export type Indicators = ReturnType<typeof computeIndicators>;
