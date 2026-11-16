import { describe, expect, it } from 'vitest';
import { buildStatusReport, isReportDue, reportPeriod, stripMoney, type StatusReportInput } from '../../src/domain/statusReport';

const TODAY = '2026-11-16';
const period = { periodStart: '2026-11-10', periodEnd: TODAY };

const task = (over: Partial<StatusReportInput['tasks'][number]> = {}) => ({
  status: 'IN_PROGRESS',
  dueDate: '2026-11-30',
  startDate: '2026-11-01',
  progress: 50,
  plannedCostCents: 10000,
  estimatedHours: null,
  ...over,
});

const base = (over: Partial<StatusReportInput> = {}): StatusReportInput => ({
  project: { status: 'EXECUTING', endDate: '2026-12-31', plannedBudgetCents: 100000, currency: 'USD' },
  tasks: [task(), task({ status: 'DONE', progress: 100 }), task({ status: 'BLOCKED', dueDate: '2026-11-10' })],
  milestones: [],
  risks: [],
  incidents: [],
  changes: [],
  actualCostCents: 20000,
  evm: null,
  ...over,
});

describe('período del informe', () => {
  it('sin informe previo empieza en el inicio; con previo, el día siguiente; mismo día queda de un día', () => {
    expect(reportPeriod(null, '2026-11-01', TODAY)).toEqual({ periodStart: '2026-11-01', periodEnd: TODAY });
    expect(reportPeriod('2026-11-09', '2026-11-01', TODAY)).toEqual({ periodStart: '2026-11-10', periodEnd: TODAY });
    expect(reportPeriod(TODAY, '2026-11-01', TODAY)).toEqual({ periodStart: TODAY, periodEnd: TODAY });
    expect(reportPeriod(null, '2026-12-01', TODAY)).toEqual({ periodStart: TODAY, periodEnd: TODAY });
  });

  it('toca emitir según la frecuencia', () => {
    expect(isReportDue('NONE', null, '2026-11-01', '2026-12-31')).toBe(false);
    expect(isReportDue('WEEKLY', null, null, TODAY)).toBe(false);
    expect(isReportDue('WEEKLY', '2026-11-09', '2026-11-01', '2026-11-15')).toBe(false);
    expect(isReportDue('WEEKLY', '2026-11-09', '2026-11-01', TODAY)).toBe(true);
    expect(isReportDue('BIWEEKLY', '2026-11-09', null, '2026-11-23')).toBe(true);
    expect(isReportDue('MONTHLY', null, '2026-11-01', '2026-12-01')).toBe(true);
    expect(isReportDue('MONTHLY', null, '2026-11-01', '2026-11-30')).toBe(false);
  });
});

describe('contenido del informe', () => {
  it('avance, salud y presupuesto', () => {
    const report = buildStatusReport(base(), period, TODAY);
    expect(report.progress).toMatchObject({ overdueTasks: 1, blockedTasks: 1, doneTasks: 1, totalTasks: 3 });
    expect(report.health).toBe('ATTENTION');
    expect(report.budget).toEqual({ plannedCents: 100000, actualCents: 20000, varianceCents: 80000, currency: 'USD' });
    expect(report.performance).toBeNull();
  });

  it('cinco riesgos abiertos de mayor puntaje, hitos del período y conteos del período', () => {
    const risks = [
      ...[1, 2, 3, 4, 5, 6].map((p) => ({ description: `R${p}`, probability: p > 5 ? 5 : p, impact: 3, status: 'OPEN' })),
      { description: 'Cerrado', probability: 5, impact: 5, status: 'CLOSED' },
    ];
    const report = buildStatusReport(
      base({
        risks,
        milestones: [
          { name: 'Antes', dueDate: '2026-11-05', status: 'REACHED' },
          { name: 'Dentro', dueDate: '2026-11-12', status: 'REACHED' },
          { name: 'Vencido', dueDate: '2026-11-14', status: 'PENDING' },
          { name: 'Pronto', dueDate: '2026-12-10', status: 'PENDING' },
          { name: 'Lejos', dueDate: '2027-02-01', status: 'PENDING' },
        ],
        incidents: [
          { status: 'RESOLVED', createdOn: '2026-11-01', resolvedOn: '2026-11-12' },
          { status: 'OPEN', createdOn: '2026-11-11', resolvedOn: null },
          { status: 'IN_PROGRESS', createdOn: '2026-11-02', resolvedOn: null },
        ],
        changes: [
          { status: 'APPLIED', decidedOn: '2026-11-11', appliedOn: '2026-11-13' },
          { status: 'APPROVED', decidedOn: '2026-11-03', appliedOn: null },
          { status: 'REJECTED', decidedOn: '2026-11-15', appliedOn: null },
          { status: 'PENDING', decidedOn: null, appliedOn: null },
        ],
      }),
      period,
      TODAY,
    );
    expect(report.risks.openCount).toBe(6);
    expect(report.risks.top).toHaveLength(5);
    expect(report.risks.top[0]).toEqual({ description: 'R5', score: 15, high: true, status: 'OPEN' });
    expect(report.risks.top.map((r) => r.description)).not.toContain('Cerrado');
    expect(report.milestones.reached).toEqual([{ name: 'Dentro', dueDate: '2026-11-12' }]);
    expect(report.milestones.overdue).toEqual([{ name: 'Vencido', dueDate: '2026-11-14' }]);
    expect(report.milestones.upcoming).toEqual([{ name: 'Pronto', dueDate: '2026-12-10' }]);
    expect(report.incidents).toEqual({ open: 2, openedInPeriod: 1, resolvedInPeriod: 1 });
    expect(report.changes).toEqual({ pending: 1, approvedInPeriod: 1, rejectedInPeriod: 1, appliedInPeriod: 1 });
  });

  it('sin dinero: no queda ninguna clave que termine en Cents', () => {
    const evm = {
      baseline: { bacCents: 20000, tasks: [{ taskId: 't1', title: 'Obra', startDate: '2026-11-01', dueDate: '2026-11-30', plannedCostCents: 20000 }] },
      tasks: [{ id: 't1', title: 'Obra', progress: 50, dueDate: '2026-11-30', plannedCostCents: 20000 }],
      expenses: [{ amountCents: 8000, date: '2026-11-05', taskId: 't1' }],
      plannedBudgetCents: 100000,
      contingencyCents: 0,
      managementCents: 0,
    };
    const full = buildStatusReport(base({ evm }), period, TODAY);
    expect(full.performance).toMatchObject({ evCents: 10000, acCents: 8000, eacMethod: 'CPI' });
    const pub = stripMoney(full);
    expect(JSON.stringify(pub)).not.toMatch(/Cents"/);
    expect(pub).not.toHaveProperty('budget');
    expect(pub.performance).toEqual({ cpi: 1.25, spi: full.performance!.spi, eacMethod: 'CPI' });
    expect(stripMoney(buildStatusReport(base(), period, TODAY)).performance).toBeNull();
  });
});
