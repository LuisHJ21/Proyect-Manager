import { describe, expect, it } from 'vitest';
import { weekStart, weeklyLoad } from '../../src/domain/workload';

const task = (over: object = {}) => ({ status: 'TODO', startDate: '2026-11-19', dueDate: '2026-11-25', estimatedHours: 20, assigneeIds: ['ana', 'beto'], ...over });

describe('weekStart', () => {
  it('devuelve el lunes de la semana', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });
});

describe('weeklyLoad', () => {
  const weeks = ['2026-11-16', '2026-11-23'];

  it('reparte las horas por persona y por día, y suma lo estimado', () => {
    const load = weeklyLoad([task()], weeks);
    const ana = load.get('ana')!;
    expect(ana[0]).toBeCloseTo((20 / 2 / 7) * 4, 5);
    expect(ana[1]).toBeCloseTo((20 / 2 / 7) * 3, 5);
    expect(ana[0]! + ana[1]!).toBeCloseTo(10, 5);
    expect(load.get('beto')).toEqual(ana);
  });

  it('una tarea hecha, sin fechas o sin horas no suma', () => {
    const load = weeklyLoad([task({ status: 'DONE' }), task({ startDate: null }), task({ estimatedHours: null }), task({ assigneeIds: [] })], weeks);
    expect(load.size).toBe(0);
  });

  it('las horas fuera de las semanas pedidas no cuentan', () => {
    const load = weeklyLoad([task({ startDate: '2026-12-01', dueDate: '2026-12-02', assigneeIds: ['ana'] })], weeks);
    expect(load.get('ana')).toEqual([0, 0]);
  });
});
