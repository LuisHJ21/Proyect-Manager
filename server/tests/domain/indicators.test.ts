import { describe, expect, it } from 'vitest';
import { computeIndicators } from '../../src/domain/indicators';

const TODAY = '2026-11-06';
const task = (over: object = {}) => ({ status: 'TODO', progress: 0, dueDate: null, ...over });
const base = { tasks: [], milestones: [] };

describe('computeIndicators', () => {
  it('progress es 0 sin tareas', () => {
    expect(computeIndicators(base, TODAY).progress).toBe(0);
  });

  it('progress es el promedio simple redondeado', () => {
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
