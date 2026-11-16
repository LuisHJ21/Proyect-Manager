import { describe, expect, it } from 'vitest';
import { computeIndicators, weightedProgress } from '../../src/domain/indicators';

const TODAY = '2026-11-06';
const task = (over: object = {}) => ({ status: 'TODO', progress: 0, dueDate: null, startDate: null, plannedCostCents: 0, ...over });
const base = { tasks: [], milestones: [] };

describe('computeIndicators', () => {
  it('progress es 0 sin tareas', () => {
    expect(computeIndicators(base, TODAY).progress).toBe(0);
  });

  it('sin costos ni fechas, cada tarea pesa lo mismo y se redondea', () => {
    const tasks = [task({ progress: 10 }), task({ progress: 20 }), task({ progress: 25 })];
    expect(computeIndicators({ ...base, tasks }, TODAY).progress).toBe(18);
  });

  it('la fecha límite de hoy no está vencida; la de ayer sí; DONE nunca', () => {
    const tasks = [
      task({ dueDate: TODAY }),
      task({ dueDate: '2026-11-05' }),
      task({ dueDate: '2026-11-05', status: 'DONE' }),
      task(),
    ];
    expect(computeIndicators({ ...base, tasks }, TODAY).overdueTasks).toBe(1);
  });

  it('cuenta las tareas bloqueadas', () => {
    const tasks = [task({ status: 'BLOCKED' }), task()];
    expect(computeIndicators({ ...base, tasks }, TODAY).blockedTasks).toBe(1);
  });

  it('highRisks cuenta puntaje de 15 o más sin cerrar', () => {
    const risks = [
      { probability: 3, impact: 5, status: 'OPEN' },
      { probability: 5, impact: 5, status: 'TREATING' },
      { probability: 3, impact: 4, status: 'OPEN' },
      { probability: 5, impact: 5, status: 'CLOSED' },
    ];
    expect(computeIndicators({ ...base, risks }, TODAY).highRisks).toBe(2);
  });

  it('hitos próximos: hoy y hoy+14 sí; hoy+15, vencidos y alcanzados no', () => {
    const milestones = [
      { id: 'a', name: 'A', dueDate: TODAY, status: 'PENDING' },
      { id: 'b', name: 'B', dueDate: '2026-11-20', status: 'PENDING' },
      { id: 'c', name: 'C', dueDate: '2026-11-21', status: 'PENDING' },
      { id: 'd', name: 'D', dueDate: '2026-11-05', status: 'PENDING' },
      { id: 'e', name: 'E', dueDate: '2026-11-10', status: 'REACHED' },
    ];
    const { upcomingMilestones } = computeIndicators({ ...base, milestones }, TODAY);
    expect(upcomingMilestones.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('budget calcula la diferencia, que puede ser negativa', () => {
    const result = computeIndicators({ ...base, plannedBudgetCents: 1000, expenses: [{ amountCents: 700 }, { amountCents: 800 }] }, TODAY);
    expect(result.budget).toEqual({ plannedCents: 1000, spentCents: 1500, differenceCents: -500 });
  });

  it('sin datos de PM no incluye budget ni highRisks', () => {
    const result = computeIndicators(base, TODAY);
    expect(result).not.toHaveProperty('budget');
    expect(result).not.toHaveProperty('highRisks');
  });
});

describe('weightedProgress', () => {
  const t = (progress: number, plannedCostCents = 0, startDate: string | null = null, dueDate: string | null = null) => ({ progress, plannedCostCents, startDate, dueDate });

  it('pondera por costo si todas las tareas lo tienen', () => {
    expect(weightedProgress([t(100, 100), t(0, 300)])).toBe(25);
  });

  it('sin costos pondera por duración, contando el día de inicio y el de fin', () => {
    expect(weightedProgress([t(100, 0, '2026-01-01', '2026-01-01'), t(0, 0, '2026-01-01', '2026-01-03')])).toBe(25);
  });

  it('si a una tarea le falta el costo, todo el proyecto se pondera por duración', () => {
    expect(weightedProgress([t(100, 100, '2026-01-01', '2026-01-01'), t(0, 0, '2026-01-01', '2026-01-03')])).toBe(25);
  });

  it('una tarea sin fechas pesa 1 día', () => {
    expect(weightedProgress([t(100), t(0)])).toBe(50);
  });

  it('una tarea con las fechas al revés pesa 1 día', () => {
    expect(weightedProgress([t(100, 0, '2026-01-05', '2026-01-01'), t(0, 0, '2026-01-01', '2026-01-03')])).toBe(25);
  });

  it('sin tareas es 0', () => {
    expect(weightedProgress([])).toBe(0);
  });
});

describe('weightedProgress con horas estimadas', () => {
  const h = (progress: number, estimatedHours: number | null, plannedCostCents = 100) => ({ progress, estimatedHours, plannedCostCents, startDate: null, dueDate: null });
  it('pondera por horas si todas las hojas las tienen', () => {
    expect(weightedProgress([h(100, 2), h(0, 6)])).toBe(25);
  });
  it('si a una le faltan horas, usa el costo', () => {
    expect(weightedProgress([h(100, 2, 100), h(0, null, 100)])).toBe(50);
  });
});
