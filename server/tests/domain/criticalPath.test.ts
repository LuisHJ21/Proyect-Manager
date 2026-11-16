import { describe, expect, it } from 'vitest';
import { criticalPath } from '../../src/domain/criticalPath';

const t = (id: string, startDate: string, dueDate: string) => ({ id, startDate, dueDate });
const d = (predecessorId: string, successorId: string, type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS', lagDays = 0) => ({ predecessorId, successorId, type, lagDays });

describe('criticalPath', () => {
  it('una cadena FS que llega al fin del proyecto es crítica', () => {
    const result = criticalPath([t('A', '2026-01-01', '2026-01-03'), t('B', '2026-01-04', '2026-01-05')], [d('A', 'B')], '2026-01-05');
    expect(result.tasks.get('A')).toMatchObject({ earlyStart: '2026-01-01', earlyFinish: '2026-01-03', lateFinish: '2026-01-03', totalFloat: 0, critical: true });
    expect(result.tasks.get('B')).toMatchObject({ totalFloat: 0, critical: true });
    expect(result.critical).toEqual(['A', 'B']);
  });

  it('la rama corta tiene holgura', () => {
    const tasks = [t('A', '2026-01-01', '2026-01-01'), t('B', '2026-01-02', '2026-01-06'), t('C', '2026-01-02', '2026-01-03'), t('D', '2026-01-07', '2026-01-07')];
    const result = criticalPath(tasks, [d('A', 'B'), d('A', 'C'), d('B', 'D'), d('C', 'D')], null);
    expect(result.tasks.get('C')).toMatchObject({ totalFloat: 3, critical: false, lateStart: '2026-01-05' });
    expect(result.tasks.get('B')!.totalFloat).toBe(0);
    expect(result.critical).toEqual(['A', 'B', 'D']);
  });

  it('SS con desfase empuja el inicio temprano', () => {
    const result = criticalPath([t('A', '2026-01-01', '2026-01-05'), t('B', '2026-01-01', '2026-01-03')], [d('A', 'B', 'SS', 1)], null);
    expect(result.tasks.get('B')).toMatchObject({ earlyStart: '2026-01-02', earlyFinish: '2026-01-04' });
  });

  it('FF y SF acotan el fin', () => {
    const ff = criticalPath([t('A', '2026-01-01', '2026-01-10'), t('B', '2026-01-01', '2026-01-02')], [d('A', 'B', 'FF')], null);
    expect(ff.tasks.get('B')).toMatchObject({ earlyFinish: '2026-01-10', earlyStart: '2026-01-09' });
    const sf = criticalPath([t('A', '2026-01-05', '2026-01-10'), t('B', '2026-01-01', '2026-01-02')], [d('A', 'B', 'SF')], null);
    expect(sf.tasks.get('B')).toMatchObject({ earlyFinish: '2026-01-05' });
  });

  it('FS con desfase negativo permite solaparse', () => {
    const result = criticalPath([t('A', '2026-01-01', '2026-01-10'), t('B', '2026-01-09', '2026-01-10')], [d('A', 'B', 'FS', -2)], null);
    expect(result.tasks.get('B')).toMatchObject({ earlyStart: '2026-01-09', totalFloat: 0 });
  });

  it('el fin del proyecto posterior da holgura a la última tarea', () => {
    const result = criticalPath([t('A', '2026-01-01', '2026-01-03'), t('B', '2026-01-04', '2026-01-05')], [d('A', 'B')], '2026-01-08');
    expect(result.tasks.get('B')!.totalFloat).toBe(3);
    expect(result.critical).toEqual([]);
  });

  it('una dependencia hacia una tarea sin fechas la deja sin calcular', () => {
    const result = criticalPath([t('A', '2026-01-01', '2026-01-03')], [d('A', 'X')], null);
    expect(result.unscheduled).toEqual(['X']);
    expect(result.tasks.has('X')).toBe(false);
    expect(result.tasks.get('A')!.critical).toBe(true);
  });
});
