import { addDays } from '@pm/shared';

export type IndicatorsInput = {
  tasks: { status: string; progress: number; dueDate: string | null }[];
  milestones: { id: string; name: string; dueDate: string; status: string }[];
  /** Los siguientes datos solo se proporcionan para un Project Manager. */
  plannedBudgetCents?: number;
  expenses?: { amountCents: number }[];
  risks?: { probability: number; impact: number; status: string }[];
};

export const HIGH_RISK_SCORE = 15;
const UPCOMING_MILESTONE_DAYS = 14;

export function averageProgress(progressValues: number[]): number {
  if (progressValues.length === 0) return 0;
  return Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length);
}

function computeBudget(plannedCents: number, expenses: { amountCents: number }[]) {
  const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  return { plannedCents, spentCents, differenceCents: plannedCents - spentCents };
}

export function computeIndicators(input: IndicatorsInput, today: string) {
  const horizon = addDays(today, UPCOMING_MILESTONE_DAYS);
  return {
    progress: averageProgress(input.tasks.map((t) => t.progress)),
    overdueTasks: input.tasks.filter((t) => t.dueDate !== null && t.dueDate < today && t.status !== 'DONE').length,
    blockedTasks: input.tasks.filter((t) => t.status === 'BLOCKED').length,
    upcomingMilestones: input.milestones
      .filter((m) => m.status === 'PENDING' && m.dueDate >= today && m.dueDate <= horizon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(({ id, name, dueDate }) => ({ id, name, dueDate })),
    ...(input.plannedBudgetCents !== undefined ? { budget: computeBudget(input.plannedBudgetCents, input.expenses ?? []) } : {}),
    ...(input.risks
      ? { highRisks: input.risks.filter((r) => r.status !== 'CLOSED' && r.probability * r.impact >= HIGH_RISK_SCORE).length }
      : {}),
  };
}

export type Indicators = ReturnType<typeof computeIndicators>;
