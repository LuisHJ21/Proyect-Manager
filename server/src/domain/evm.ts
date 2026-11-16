import { diffDays } from '@pm/shared';

export type BaselineTaskInput = { taskId: string; title: string; startDate: string; dueDate: string; plannedCostCents: number };
export type EvmInput = {
  baseline: { bacCents: number; tasks: BaselineTaskInput[] };
  tasks: { id: string; title: string; progress: number; dueDate: string | null; plannedCostCents: number }[];
  expenses: { amountCents: number; date: string; taskId: string | null }[];
  plannedBudgetCents: number;
  contingencyCents: number;
  managementCents: number;
};
export type EvmTaskRow = {
  taskId: string;
  title: string;
  baselineCostCents: number | null;
  progress: number | null;
  evCents: number | null;
  linkedCostCents: number;
  finishVarianceDays: number | null;
  state: 'LATE' | 'ON_TIME' | 'OUTSIDE' | 'DELETED';
};
export type EvmMetrics = {
  pvCents: number;
  evCents: number;
  acCents: number;
  bacCents: number;
  cpi: number | null;
  spi: number | null;
  cvCents: number;
  svCents: number;
  eacCents: number;
  /** Cómo se calculó el EAC: con el CPI, como variación atípica (CPI 0) o igual al BAC sin gasto. */
  eacMethod: 'CPI' | 'ATYPICAL' | 'BUDGET';
  etcCents: number;
  vacCents: number;
  percentComplete: number;
  contingencyCents: number;
  managementCents: number;
  /** Presupuesto − BAC − contingencia − gestión; negativo si no alcanza. */
  unallocatedCents: number;
  /** Sobrecosto proyectado (EAC − BAC) que consumiría la contingencia. */
  contingencyUseCents: number;
  contingencyExceeded: boolean;
};

/** Fracción del plazo de una tarea transcurrida a una fecha, contando el día de inicio y el de fin. */
function plannedFraction(task: BaselineTaskInput, date: string): number {
  const elapsed = diffDays(task.startDate, date) + 1;
  const total = diffDays(task.startDate, task.dueDate) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
}

/** Valor planeado a una fecha: el costo de cada tarea repartido en línea recta entre su inicio y su fin. */
export function plannedValueAt(tasks: BaselineTaskInput[], date: string): number {
  return Math.round(tasks.reduce((sum, task) => sum + task.plannedCostCents * plannedFraction(task, date), 0));
}

const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : Math.round((numerator / denominator) * 100) / 100);

/** Valor ganado del proyecto a una fecha, contra la línea base vigente. */
export function computeEvm(
  input: EvmInput,
  today: string,
): { metrics: EvmMetrics; tasks: EvmTaskRow[]; outsideBaseline: number; outsideBaselineCostCents: number } {
  const current = new Map(input.tasks.map((t) => [t.id, t]));
  const baselineIds = new Set(input.baseline.tasks.map((t) => t.taskId));
  const linkedCost = (taskId: string) => input.expenses.filter((e) => e.taskId === taskId).reduce((sum, e) => sum + e.amountCents, 0);

  const rows: EvmTaskRow[] = input.baseline.tasks.map((base) => {
    const task = current.get(base.taskId);
    if (!task) {
      return { taskId: base.taskId, title: base.title, baselineCostCents: base.plannedCostCents, progress: null, evCents: null, linkedCostCents: linkedCost(base.taskId), finishVarianceDays: null, state: 'DELETED' };
    }
    const variance = task.dueDate ? diffDays(base.dueDate, task.dueDate) : null;
    return {
      taskId: task.id,
      title: task.title,
      baselineCostCents: base.plannedCostCents,
      progress: task.progress,
      evCents: Math.round((base.plannedCostCents * task.progress) / 100),
      linkedCostCents: linkedCost(task.id),
      finishVarianceDays: variance,
      state: variance !== null && variance > 0 ? 'LATE' : 'ON_TIME',
    };
  });
  const outside = input.tasks.filter((t) => t.plannedCostCents > 0 && !baselineIds.has(t.id));
  for (const task of outside) {
    rows.push({ taskId: task.id, title: task.title, baselineCostCents: null, progress: task.progress, evCents: null, linkedCostCents: linkedCost(task.id), finishVarianceDays: null, state: 'OUTSIDE' });
  }
  rows.sort((a, b) => {
    if (a.finishVarianceDays !== null && b.finishVarianceDays !== null) return b.finishVarianceDays - a.finishVarianceDays;
    if (a.finishVarianceDays !== null) return -1;
    if (b.finishVarianceDays !== null) return 1;
    return a.title.localeCompare(b.title);
  });

  const bacCents = input.baseline.bacCents;
  const pvCents = plannedValueAt(input.baseline.tasks, today);
  const evCents = rows.reduce((sum, row) => sum + (row.state === 'OUTSIDE' ? 0 : (row.evCents ?? 0)), 0);
  const acCents = input.expenses.filter((e) => e.date <= today).reduce((sum, e) => sum + e.amountCents, 0);
  const cpi = ratio(evCents, acCents);
  const spi = ratio(evCents, pvCents);
  // CPI 0 (gasto sin avance) no permite proyectar: se suma lo gastado a lo que falta del BAC.
  const eacMethod: EvmMetrics['eacMethod'] = cpi === null ? 'BUDGET' : cpi > 0 ? 'CPI' : 'ATYPICAL';
  const eacCents = eacMethod === 'CPI' ? Math.round(bacCents / cpi!) : eacMethod === 'ATYPICAL' ? acCents + bacCents - evCents : bacCents;
  const spentToDate = input.expenses.filter((e) => e.date <= today);
  const outsideBaselineCostCents = spentToDate.filter((e) => !e.taskId || !baselineIds.has(e.taskId)).reduce((sum, e) => sum + e.amountCents, 0);

  return {
    metrics: {
      pvCents,
      evCents,
      acCents,
      bacCents,
      cpi,
      spi,
      cvCents: evCents - acCents,
      svCents: evCents - pvCents,
      eacCents,
      eacMethod,
      etcCents: Math.max(eacCents - acCents, 0),
      vacCents: bacCents - eacCents,
      percentComplete: bacCents === 0 ? 0 : Math.round((evCents / bacCents) * 100),
      contingencyCents: input.contingencyCents,
      managementCents: input.managementCents,
      unallocatedCents: input.plannedBudgetCents - bacCents - input.contingencyCents - input.managementCents,
      contingencyUseCents: Math.max(0, eacCents - bacCents),
      contingencyExceeded: eacCents - bacCents > input.contingencyCents,
    },
    tasks: rows,
    outsideBaseline: outside.length,
    outsideBaselineCostCents,
  };
}
