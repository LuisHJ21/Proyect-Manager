import { describe, expect, it } from 'vitest';
import { pauseImpact, planShift, proposedResumeDays, type ShiftTask } from '../../src/domain/pause';

const task = (id: string, status: string, startDate: string | null, dueDate: string | null): ShiftTask => ({ id, title: `Tarea ${id}`, status, startDate, dueDate });

describe('planShift', () => {
  const input = {
    tasks: [
      task('todo', 'TODO', '2026-11-01', '2026-11-05'),
      task('blocked', 'BLOCKED', '2026-11-01', '2026-11-05'),
      task('doing', 'IN_PROGRESS', '2026-11-01', '2026-11-05'),
      task('done', 'DONE', '2026-11-01', '2026-11-05'),
      task('onlyStart', 'TODO', '2026-11-01', null),
      task('onlyDue', 'TODO', null, '2026-11-05'),
    ],
    milestones: [
      { id: 'm1', name: 'Entrega', dueDate: '2026-11-20', status: 'PENDING' },
      { id: 'm2', name: 'Inicio', dueDate: '2026-10-01', status: 'REACHED' },
    ],
    endDate: '2026-12-31',
  };

  it('mueve lo pendiente N días y respeta lo empezado y lo terminado', () => {
    const plan = planShift(input, 10);
    expect(plan.tasks).toEqual([
      { id: 'todo', name: 'Tarea todo', from: { startDate: '2026-11-01', dueDate: '2026-11-05' }, to: { startDate: '2026-11-11', dueDate: '2026-11-15' } },
      { id: 'blocked', name: 'Tarea blocked', from: { startDate: '2026-11-01', dueDate: '2026-11-05' }, to: { startDate: '2026-11-11', dueDate: '2026-11-15' } },
      { id: 'doing', name: 'Tarea doing', from: { startDate: '2026-11-01', dueDate: '2026-11-05' }, to: { startDate: '2026-11-01', dueDate: '2026-11-15' } },
    ]);
    expect(plan.milestones).toEqual([{ id: 'm1', name: 'Entrega', from: '2026-11-20', to: '2026-11-30' }]);
    expect(plan.endDate).toEqual({ from: '2026-12-31', to: '2027-01-10' });
  });

  it('sin fecha de fin del proyecto no la propone', () => {
    expect(planShift({ ...input, endDate: null }, 10).endDate).toBeNull();
  });

  it('con 0 días no cambia nada', () => {
    expect(planShift(input, 0)).toEqual({ tasks: [], milestones: [], endDate: null });
  });
});

describe('proposedResumeDays', () => {
  it('días corridos desde la pausa, de 0 a 365', () => {
    expect(proposedResumeDays('2026-11-01', '2026-11-16')).toBe(15);
    expect(proposedResumeDays(null, '2026-11-16')).toBe(0);
    expect(proposedResumeDays('2026-11-20', '2026-11-16')).toBe(0);
    expect(proposedResumeDays('2024-01-01', '2026-11-16')).toBe(365);
  });
});

describe('pauseImpact', () => {
  const today = '2026-11-16'; // lunes
  const load = (projectId: string, id: string, hours: number) => ({
    projectId,
    status: 'TODO',
    startDate: '2026-11-16',
    dueDate: '2026-11-20',
    estimatedHours: hours,
    assigneeIds: [id],
  });

  it('solo las personas de ambos proyectos, con sus horas por proyecto', () => {
    const shared = pauseImpact(
      {
        members: [
          { userId: 'ana', name: 'Ana', projectIds: ['A', 'B'] },
          { userId: 'luis', name: 'Luis', projectIds: ['A'] },
        ],
        tasks: [load('A', 'ana', 10), load('A', 'ana', 2.25), load('B', 'ana', 6), load('A', 'luis', 8), load('C', 'ana', 40)],
      },
      'A',
      'B',
      today,
    );
    expect(shared).toEqual([{ userId: 'ana', name: 'Ana', hours: [{ projectId: 'A', total: 12.3 }, { projectId: 'B', total: 6 }] }]);
  });

  it('sin personas compartidas devuelve una lista vacía', () => {
    expect(pauseImpact({ members: [{ userId: 'luis', name: 'Luis', projectIds: ['A'] }], tasks: [] }, 'A', 'B', today)).toEqual([]);
  });
});
