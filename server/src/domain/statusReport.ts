import { addDays, REPORT_FREQUENCY_DAYS, type Health } from '@pm/shared';
import { computeEvm, type EvmInput, type EvmMetrics } from './evm';
import { computeHealth, DEFAULT_THRESHOLDS, isHighRisk, isOverdue, type HealthThresholds } from './health';
import { weightedProgress, type ProgressTask } from './indicators';

const UPCOMING_MILESTONE_DAYS = 30;
const TOP_RISKS = 5;

export type ReportPeriod = { periodStart: string; periodEnd: string };

export type StatusReportInput = {
  project: { status: string; endDate: string | null; plannedBudgetCents: number; currency: string };
  /** Solo hojas de la EDT. */
  tasks: (ProgressTask & { status: string; dueDate: string | null })[];
  milestones: { name: string; dueDate: string; status: string }[];
  /** `description` ya en texto plano. */
  risks: { description: string; probability: number; impact: number; status: string }[];
  /** Fechas locales YYYY-MM-DD de las marcas de tiempo. */
  incidents: { status: string; createdOn: string; resolvedOn: string | null }[];
  changes: { status: string; decidedOn: string | null; appliedOn: string | null }[];
  /** Gastos más mano de obra del equipo. */
  actualCostCents: number;
  evm: EvmInput | null;
  /** Umbrales del proyecto; por defecto los de siempre. */
  thresholds?: HealthThresholds;
};

type MilestoneLine = { name: string; dueDate: string };

export type StatusReportSnapshot = {
  health: Health | null;
  progress: { percent: number; overdueTasks: number; blockedTasks: number; doneTasks: number; totalTasks: number };
  performance: Pick<EvmMetrics, 'cpi' | 'spi' | 'eacMethod' | 'pvCents' | 'evCents' | 'acCents' | 'eacCents' | 'vacCents'> | null;
  budget: { plannedCents: number; actualCents: number; varianceCents: number; currency: string };
  milestones: { reached: MilestoneLine[]; upcoming: MilestoneLine[]; overdue: MilestoneLine[] };
  risks: { openCount: number; top: { description: string; score: number; high: boolean; status: string }[] };
  incidents: { open: number; openedInPeriod: number; resolvedInPeriod: number };
  changes: { pending: number; approvedInPeriod: number; rejectedInPeriod: number; appliedInPeriod: number };
};

/** Lo que recibe quien no es PM: sin presupuesto ni montos de valor ganado. */
export type PublicStatusReport = Omit<StatusReportSnapshot, 'budget' | 'performance'> & {
  performance: Pick<EvmMetrics, 'cpi' | 'spi' | 'eacMethod'> | null;
};

/** Desde el día siguiente al informe anterior (o el inicio del proyecto) hasta hoy; nunca empieza después de hoy. */
export function reportPeriod(previousEnd: string | null, projectStart: string, today: string): ReportPeriod {
  const start = previousEnd ? addDays(previousEnd, 1) : projectStart;
  return { periodStart: start > today ? today : start, periodEnd: today };
}

/** Toca emitir cuando pasaron los días de la frecuencia desde el último informe (o desde el inicio). */
export function isReportDue(frequency: string, lastEnd: string | null, projectStart: string | null, today: string): boolean {
  const days = REPORT_FREQUENCY_DAYS[frequency as keyof typeof REPORT_FREQUENCY_DAYS];
  const from = lastEnd ?? projectStart;
  if (!days || !from) return false;
  return today >= addDays(from, days);
}

const inPeriod = (date: string | null, period: ReportPeriod) => date !== null && date >= period.periodStart && date <= period.periodEnd;
const byDate = (a: MilestoneLine, b: MilestoneLine) => a.dueDate.localeCompare(b.dueDate);
const line = ({ name, dueDate }: MilestoneLine) => ({ name, dueDate });

export function buildStatusReport(input: StatusReportInput, period: ReportPeriod, today: string): StatusReportSnapshot {
  const { project, tasks } = input;
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const overdueTasks = tasks.filter((t) => isOverdue(t, today)).length;
  const metrics = input.evm ? computeEvm(input.evm, today).metrics : null;
  const openRisks = input.risks.filter((r) => r.status !== 'CLOSED');
  const horizon = addDays(today, UPCOMING_MILESTONE_DAYS);
  const pending = input.milestones.filter((m) => m.status === 'PENDING');
  const decided = (statuses: string[]) => input.changes.filter((c) => statuses.includes(c.status) && inPeriod(c.decidedOn, period)).length;

  return {
    health: computeHealth(
      {
        status: project.status,
        endDate: project.endDate,
        plannedBudgetCents: project.plannedBudgetCents,
        spentCents: input.actualCostCents,
        overdueTasks,
        highRisks: input.risks.filter((r) => isHighRisk(r, t.highRiskScore)).length,
        cpi: metrics?.cpi,
        spi: metrics?.spi,
      },
      today,
      t,
    ),
    progress: {
      percent: weightedProgress(tasks),
      overdueTasks,
      blockedTasks: tasks.filter((t) => t.status === 'BLOCKED').length,
      doneTasks: tasks.filter((t) => t.status === 'DONE').length,
      totalTasks: tasks.length,
    },
    performance: metrics
      ? {
          cpi: metrics.cpi,
          spi: metrics.spi,
          eacMethod: metrics.eacMethod,
          pvCents: metrics.pvCents,
          evCents: metrics.evCents,
          acCents: metrics.acCents,
          eacCents: metrics.eacCents,
          vacCents: metrics.vacCents,
        }
      : null,
    budget: {
      plannedCents: project.plannedBudgetCents,
      actualCents: input.actualCostCents,
      varianceCents: project.plannedBudgetCents - input.actualCostCents,
      currency: project.currency,
    },
    milestones: {
      // El hito no guarda cuándo se alcanzó: cuenta su fecha prevista.
      reached: input.milestones.filter((m) => m.status === 'REACHED' && inPeriod(m.dueDate, period)).sort(byDate).map(line),
      upcoming: pending.filter((m) => m.dueDate > today && m.dueDate <= horizon).sort(byDate).map(line),
      overdue: pending.filter((m) => m.dueDate < today).sort(byDate).map(line),
    },
    risks: {
      openCount: openRisks.length,
      top: openRisks
        .map((r) => ({ description: r.description, score: r.probability * r.impact, high: r.probability * r.impact >= t.highRiskScore, status: r.status }))
        .sort((a, b) => b.score - a.score || a.description.localeCompare(b.description))
        .slice(0, TOP_RISKS),
    },
    incidents: {
      open: input.incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length,
      openedInPeriod: input.incidents.filter((i) => inPeriod(i.createdOn, period)).length,
      resolvedInPeriod: input.incidents.filter((i) => inPeriod(i.resolvedOn, period)).length,
    },
    changes: {
      pending: input.changes.filter((c) => c.status === 'PENDING').length,
      approvedInPeriod: decided(['APPROVED', 'APPLIED']),
      rejectedInPeriod: decided(['REJECTED']),
      appliedInPeriod: input.changes.filter((c) => inPeriod(c.appliedOn, period)).length,
    },
  };
}

export function stripMoney(snapshot: StatusReportSnapshot): PublicStatusReport {
  const { budget: _budget, performance, ...rest } = snapshot;
  return { ...rest, performance: performance ? { cpi: performance.cpi, spi: performance.spi, eacMethod: performance.eacMethod } : null };
}
