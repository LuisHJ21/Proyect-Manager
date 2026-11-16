import { describe, expect, it } from 'vitest';
import { computeEvm, plannedValueAt, type BaselineTaskInput, type EvmInput } from '../../src/domain/evm';

const baseTask: BaselineTaskInput = { taskId: 't1', title: 'Diseño', startDate: '2026-11-01', dueDate: '2026-11-10', plannedCostCents: 100000 };

const input = (overrides: Partial<EvmInput> = {}): EvmInput => ({
  baseline: { bacCents: 100000, tasks: [baseTask] },
  tasks: [{ id: 't1', title: 'Diseño', progress: 40, dueDate: '2026-11-10', plannedCostCents: 100000 }],
  expenses: [],
  plannedBudgetCents: 100000,
  contingencyCents: 0,
  managementCents: 0,
  ...overrides,
});

describe('plannedValueAt', () => {
  it('PV antes, en el inicio, a la mitad, en el fin y después', () => {
    expect(plannedValueAt([baseTask], '2026-10-31')).toBe(0);
    expect(plannedValueAt([baseTask], '2026-11-01')).toBe(10000);
    expect(plannedValueAt([baseTask], '2026-11-05')).toBe(50000);
    expect(plannedValueAt([baseTask], '2026-11-10')).toBe(100000);
    expect(plannedValueAt([baseTask], '2026-11-20')).toBe(100000);
  });

  it('una tarea de un solo día vale su costo desde ese día', () => {
    const oneDay = { ...baseTask, startDate: '2026-11-03', dueDate: '2026-11-03' };
    expect(plannedValueAt([oneDay], '2026-11-02')).toBe(0);
    expect(plannedValueAt([oneDay], '2026-11-03')).toBe(100000);
  });
});

describe('computeEvm', () => {
  it('EV usa el costo base y el avance actual', () => {
    const { metrics } = computeEvm(input({ tasks: [{ id: 't1', title: 'Diseño', progress: 40, dueDate: '2026-11-10', plannedCostCents: 999 }] }), '2026-11-05');
    expect(metrics.evCents).toBe(40000);
  });

  it('CPI y SPI null sin denominador', () => {
    const { metrics } = computeEvm(input(), '2026-11-05');
    expect(metrics.cpi).toBeNull();
    expect(metrics.eacCents).toBe(metrics.bacCents);
    expect(computeEvm(input(), '2026-10-31').metrics.spi).toBeNull();
  });

  it('índices y proyección', () => {
    const { metrics } = computeEvm(input({ expenses: [{ amountCents: 50000, date: '2026-11-04', taskId: null }] }), '2026-11-05');
    expect(metrics).toEqual({
      pvCents: 50000,
      evCents: 40000,
      acCents: 50000,
      bacCents: 100000,
      cpi: 0.8,
      spi: 0.8,
      cvCents: -10000,
      svCents: -10000,
      eacCents: 125000,
      eacMethod: 'CPI',
      etcCents: 75000,
      vacCents: -25000,
      percentComplete: 40,
      contingencyCents: 0,
      managementCents: 0,
      unallocatedCents: 0,
      contingencyUseCents: 25000,
      contingencyExceeded: true,
    });
  });

  it('gastos futuros no cuentan en AC pero sí en el gasto ligado', () => {
    const { metrics, tasks } = computeEvm(input({ expenses: [{ amountCents: 20000, date: '2026-12-01', taskId: 't1' }] }), '2026-11-05');
    expect(metrics.acCents).toBe(0);
    expect(tasks[0]!.linkedCostCents).toBe(20000);
  });

  it('tareas eliminadas y fuera de la base', () => {
    const result = computeEvm(input({ tasks: [{ id: 't9', title: 'Nueva', progress: 50, dueDate: null, plannedCostCents: 5000 }] }), '2026-11-05');
    expect(result.metrics.evCents).toBe(0);
    expect(result.outsideBaseline).toBe(1);
    expect(result.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskId: 't1', state: 'DELETED', progress: null, evCents: null, finishVarianceDays: null, baselineCostCents: 100000 }),
        expect.objectContaining({ taskId: 't9', state: 'OUTSIDE', progress: 50, evCents: null, baselineCostCents: null, finishVarianceDays: null }),
      ]),
    );
  });

  it('una tarea actual sin costo no cuenta como fuera de la base', () => {
    const extra = { id: 't2', title: 'Sin costo', progress: 0, dueDate: null, plannedCostCents: 0 };
    const result = computeEvm(input({ tasks: [...input().tasks, extra] }), '2026-11-05');
    expect(result.outsideBaseline).toBe(0);
    expect(result.tasks.map((t) => t.taskId)).toEqual(['t1']);
  });

  it('base sin tareas vigentes ni gastos', () => {
    const { metrics } = computeEvm(input({ tasks: [] }), '2026-11-05');
    expect(metrics.evCents).toBe(0);
    expect(metrics.cpi).toBeNull();
    expect(metrics.eacCents).toBe(100000);
    expect(metrics.etcCents).toBe(100000);
  });

  it('desvío y estado, ordenados por desvío', () => {
    const tasks = [
      { ...baseTask, taskId: 'a', title: 'A' },
      { ...baseTask, taskId: 'b', title: 'B' },
      { ...baseTask, taskId: 'c', title: 'C' },
    ];
    const current = [
      { id: 'a', title: 'A', progress: 0, dueDate: '2026-11-10', plannedCostCents: 1 },
      { id: 'b', title: 'B', progress: 0, dueDate: '2026-11-13', plannedCostCents: 1 },
      { id: 'c', title: 'C', progress: 0, dueDate: null, plannedCostCents: 1 },
    ];
    const rows = computeEvm(input({ baseline: { bacCents: 300000, tasks }, tasks: current }), '2026-11-05').tasks;
    expect(rows.map((r) => [r.taskId, r.finishVarianceDays, r.state])).toEqual([
      ['b', 3, 'LATE'],
      ['a', 0, 'ON_TIME'],
      ['c', null, 'ON_TIME'],
    ]);
  });

  it('reserva negativa cuando el BAC supera el presupuesto', () => {
    expect(computeEvm(input({ plannedBudgetCents: 80000 }), '2026-11-05').metrics.unallocatedCents).toBe(-20000);
  });

  it('redondea los centavos de PV', () => {
    const odd = { ...baseTask, plannedCostCents: 100 , startDate: '2026-11-01', dueDate: '2026-11-03' };
    expect(plannedValueAt([odd], '2026-11-01')).toBe(33);
  });
});

describe('EAC según el CPI', () => {
  const small = (progress: number, expenses: EvmInput['expenses']) =>
    computeEvm(
      {
        baseline: { bacCents: 1000, tasks: [{ ...baseTask, plannedCostCents: 1000 }] },
        tasks: [{ id: 't1', title: 'Diseño', progress, dueDate: '2026-11-10', plannedCostCents: 1000 }],
        expenses,
        plannedBudgetCents: 1000,
        contingencyCents: 0,
        managementCents: 0,
      },
      '2026-11-05',
    );

  it('con CPI mayor que 0 proyecta BAC / CPI', () => {
    const { metrics } = small(50, [{ amountCents: 1000, date: '2026-11-04', taskId: 't1' }]);
    expect(metrics).toMatchObject({ eacCents: 2000, eacMethod: 'CPI' });
  });

  it('con gasto y ningún avance usa AC + (BAC − EV)', () => {
    const { metrics } = small(0, [{ amountCents: 300, date: '2026-11-04', taskId: 't1' }]);
    expect(metrics).toMatchObject({ eacCents: 1300, eacMethod: 'ATYPICAL', etcCents: 1000, vacCents: -300 });
  });

  it('sin gasto queda en el presupuesto', () => {
    expect(small(30, []).metrics).toMatchObject({ eacCents: 1000, eacMethod: 'BUDGET' });
  });
});

describe('gasto fuera de la línea base', () => {
  it('suma lo gastado hasta hoy sin tarea o en tareas fuera de la base', () => {
    const result = computeEvm(
      input({
        tasks: [
          { id: 't1', title: 'Diseño', progress: 40, dueDate: '2026-11-10', plannedCostCents: 100000 },
          { id: 't2', title: 'Extra', progress: 0, dueDate: null, plannedCostCents: 500 },
        ],
        expenses: [
          { amountCents: 100, date: '2026-11-02', taskId: null },
          { amountCents: 200, date: '2026-11-03', taskId: 't2' },
          { amountCents: 50, date: '2026-11-04', taskId: 't1' },
          { amountCents: 400, date: '2026-11-20', taskId: null },
        ],
      }),
      '2026-11-05',
    );
    expect(result.outsideBaselineCostCents).toBe(300);
    expect(result.metrics.acCents).toBe(350);
  });
});

describe('reservas', () => {
  it('contingencia usada por el sobrecosto proyectado y presupuesto sin asignar', () => {
    const { metrics } = computeEvm(
      input({ plannedBudgetCents: 130000, contingencyCents: 20000, managementCents: 5000, expenses: [{ amountCents: 50000, date: '2026-11-04', taskId: null }] }),
      '2026-11-05',
    );
    expect(metrics).toMatchObject({ eacCents: 125000, contingencyUseCents: 25000, contingencyExceeded: true, unallocatedCents: 5000 });
  });

  it('sin sobrecosto no se usa contingencia', () => {
    const { metrics } = computeEvm(input({ contingencyCents: 10000, expenses: [{ amountCents: 10000, date: '2026-11-04', taskId: null }] }), '2026-11-05');
    expect(metrics.eacCents).toBeLessThan(metrics.bacCents);
    expect(metrics).toMatchObject({ contingencyUseCents: 0, contingencyExceeded: false });
  });
});

