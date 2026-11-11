import { CLOSURE_PENDING_KIND, diffDays, type ClosurePendingKind } from '@pm/shared';
import { computeEvm, type EvmInput } from './evm';

type WithStatus = { status: string }[];

export type ClosureInput = {
  project: { startDate: string | null; endDate: string | null; plannedBudgetCents: number; currency: string };
  tasks: { status: string; startDate: string | null }[];
  deliverables: WithStatus;
  incidents: WithStatus;
  risks: WithStatus;
  objectives: WithStatus;
  charterStatus: string | null;
  expenses: { amountCents: number }[];
  changes: WithStatus;
  evm: EvmInput | null;
};

export type ClosurePending = { kind: ClosurePendingKind; count: number };

export type ClosureReport = {
  dates: { plannedStart: string | null; plannedEnd: string | null; actualStart: string | null; actualEnd: string; endVarianceDays: number | null };
  budget: { plannedCents: number; actualCents: number; varianceCents: number; currency: string };
  performance: { cpi: number | null; spi: number | null; eacCents: number; vacCents: number } | null;
  objectives: { met: number; notMet: number; pending: number };
  deliverables: { PENDING: number; IN_REVIEW: number; ACCEPTED: number; REJECTED: number };
  changes: { approved: number; rejected: number; pending: number };
  incidents: { total: number; open: number };
  risks: { total: number; open: number };
  pendings: ClosurePending[];
};

const count = (items: WithStatus, ...statuses: string[]) => items.filter((i) => statuses.includes(i.status)).length;
const countNot = (items: WithStatus, status: string) => items.filter((i) => i.status !== status).length;

/** Lo que sigue abierto en el proyecto, en el orden de CLOSURE_PENDING_KIND; solo los tipos con al menos uno. */
export function closurePendings(input: ClosureInput): ClosurePending[] {
  const counts: Record<ClosurePendingKind, number> = {
    deliverables: countNot(input.deliverables, 'ACCEPTED'),
    incidents: count(input.incidents, 'OPEN', 'IN_PROGRESS'),
    risks: count(input.risks, 'OPEN', 'TREATING'),
    tasks: countNot(input.tasks, 'DONE'),
    objectives: count(input.objectives, 'PENDING'),
    charter: input.charterStatus === 'APPROVED' ? 0 : 1,
  };
  return CLOSURE_PENDING_KIND.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] }));
}

/** Informe final del proyecto: lo planificado frente a lo real a la fecha de cierre. */
export function buildClosureReport(input: ClosureInput, closingDate: string): ClosureReport {
  const { project } = input;
  const starts = input.tasks.map((t) => t.startDate).filter((d): d is string => d !== null).sort();
  const actualCents = input.expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const metrics = input.evm ? computeEvm(input.evm, closingDate).metrics : null;
  return {
    dates: {
      plannedStart: project.startDate,
      plannedEnd: project.endDate,
      actualStart: starts[0] ?? null,
      actualEnd: closingDate,
      endVarianceDays: project.endDate ? diffDays(project.endDate, closingDate) : null,
    },
    budget: { plannedCents: project.plannedBudgetCents, actualCents, varianceCents: project.plannedBudgetCents - actualCents, currency: project.currency },
    performance: metrics ? { cpi: metrics.cpi, spi: metrics.spi, eacCents: metrics.eacCents, vacCents: metrics.vacCents } : null,
    objectives: { met: count(input.objectives, 'MET'), notMet: count(input.objectives, 'NOT_MET'), pending: count(input.objectives, 'PENDING') },
    deliverables: {
      PENDING: count(input.deliverables, 'PENDING'),
      IN_REVIEW: count(input.deliverables, 'IN_REVIEW'),
      ACCEPTED: count(input.deliverables, 'ACCEPTED'),
      REJECTED: count(input.deliverables, 'REJECTED'),
    },
    changes: { approved: count(input.changes, 'APPROVED'), rejected: count(input.changes, 'REJECTED'), pending: count(input.changes, 'PENDING') },
    incidents: { total: input.incidents.length, open: count(input.incidents, 'OPEN', 'IN_PROGRESS') },
    risks: { total: input.risks.length, open: count(input.risks, 'OPEN', 'TREATING') },
    pendings: closurePendings(input),
  };
}
