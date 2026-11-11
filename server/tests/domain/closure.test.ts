import { describe, expect, it } from 'vitest';
import { buildClosureReport, closurePendings, type ClosureInput } from '../../src/domain/closure';

const base: ClosureInput = {
  project: { startDate: '2026-01-01', endDate: '2026-06-30', plannedBudgetCents: 100000, currency: 'USD' },
  tasks: [],
  deliverables: [],
  incidents: [],
  risks: [],
  objectives: [],
  charterStatus: 'APPROVED',
  expenses: [],
  changes: [],
  evm: null,
};
const s = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe('pendientes de cierre', () => {
  it('con todo resuelto no hay pendientes', () => {
    expect(
      closurePendings({
        ...base,
        deliverables: s('ACCEPTED'),
        incidents: s('CLOSED', 'RESOLVED'),
        risks: s('CLOSED'),
        tasks: [{ status: 'DONE', startDate: null }],
        objectives: s('MET', 'NOT_MET'),
      }),
    ).toEqual([]);
  });

  it('cuenta cada tipo en orden', () => {
    expect(
      closurePendings({
        ...base,
        deliverables: s('IN_REVIEW', 'PENDING', 'ACCEPTED'),
        incidents: s('IN_PROGRESS', 'CLOSED'),
        risks: s('TREATING', 'CLOSED'),
        tasks: [
          { status: 'TODO', startDate: null },
          { status: 'DONE', startDate: null },
        ],
        objectives: s('PENDING', 'MET'),
        charterStatus: 'DRAFT',
      }),
    ).toEqual([
      { kind: 'deliverables', count: 2 },
      { kind: 'incidents', count: 1 },
      { kind: 'risks', count: 1 },
      { kind: 'tasks', count: 1 },
      { kind: 'objectives', count: 1 },
      { kind: 'charter', count: 1 },
    ]);
  });

  it('sin acta cuenta como pendiente', () => {
    expect(closurePendings({ ...base, charterStatus: null })).toEqual([{ kind: 'charter', count: 1 }]);
  });
});

describe('informe de cierre', () => {
  it('fechas', () => {
    const report = buildClosureReport(
      {
        ...base,
        tasks: [
          { status: 'DONE', startDate: '2026-01-05' },
          { status: 'DONE', startDate: '2026-01-03' },
          { status: 'DONE', startDate: null },
        ],
      },
      '2026-07-10',
    );
    expect(report.dates).toEqual({ plannedStart: '2026-01-01', plannedEnd: '2026-06-30', actualStart: '2026-01-03', actualEnd: '2026-07-10', endVarianceDays: 10 });
    expect(buildClosureReport({ ...base, project: { ...base.project, endDate: null } }, '2026-07-10').dates.endVarianceDays).toBeNull();
  });

  it('presupuesto con sobrecosto', () => {
    const report = buildClosureReport({ ...base, expenses: [{ amountCents: 70000 }, { amountCents: 50000 }] }, '2026-07-10');
    expect(report.budget).toEqual({ plannedCents: 100000, actualCents: 120000, varianceCents: -20000, currency: 'USD' });
  });

  it('sin línea base no hay desempeño', () => {
    expect(buildClosureReport(base, '2026-07-10').performance).toBeNull();
  });

  it('con línea base calcula el desempeño a la fecha de cierre', () => {
    const report = buildClosureReport(
      {
        ...base,
        evm: {
          baseline: { bacCents: 10000, tasks: [{ taskId: 't1', title: 'T', startDate: '2026-01-01', dueDate: '2026-01-10', plannedCostCents: 10000 }] },
          tasks: [{ id: 't1', title: 'T', progress: 100, dueDate: '2026-01-10', plannedCostCents: 10000 }],
          expenses: [{ amountCents: 12500, date: '2026-01-09', taskId: 't1' }],
          plannedBudgetCents: 10000,
        },
      },
      '2026-02-01',
    );
    expect(report.performance).toMatchObject({ cpi: 0.8, spi: 1 });
    expect(typeof report.performance?.eacCents).toBe('number');
    expect(typeof report.performance?.vacCents).toBe('number');
  });

  it('conteos', () => {
    const report = buildClosureReport(
      {
        ...base,
        objectives: s('MET', 'NOT_MET', 'PENDING', 'MET'),
        deliverables: s('ACCEPTED', 'ACCEPTED', 'REJECTED'),
        changes: s('APPROVED', 'REJECTED', 'PENDING', 'APPROVED'),
        incidents: s('OPEN', 'CLOSED', 'RESOLVED'),
        risks: s('OPEN', 'TREATING', 'CLOSED'),
      },
      '2026-07-10',
    );
    expect(report.objectives).toEqual({ met: 2, notMet: 1, pending: 1 });
    expect(report.deliverables).toEqual({ PENDING: 0, IN_REVIEW: 0, ACCEPTED: 2, REJECTED: 1 });
    expect(report.changes).toEqual({ approved: 2, rejected: 1, pending: 1 });
    expect(report.incidents).toEqual({ total: 3, open: 1 });
    expect(report.risks).toEqual({ total: 3, open: 2 });
    expect(report.pendings.map((p) => p.kind)).toEqual(['deliverables', 'incidents', 'risks', 'objectives']);
  });
});
