import { describe, expect, it } from 'vitest';
import { buildMonthGrid, groupByDate, monthTitle, shiftMonth } from '../src/lib/calendarGrid';

describe('buildMonthGrid', () => {
  it('noviembre de 2026 empieza el lunes 26 de octubre e incluye el lunes 30', () => {
    const grid = buildMonthGrid(2026, 11);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(grid[6]!.date).toBe('2026-11-01');
    expect(grid[35]).toEqual({ date: '2026-11-30', inMonth: true });
    expect(grid[41]!.date).toBe('2026-12-06');
  });
  it('un mes de 5 semanas tiene 35 celdas', () => {
    expect(buildMonthGrid(2026, 6)).toHaveLength(35);
  });
  it('un mes que empieza en lunes no añade días previos', () => {
    expect(buildMonthGrid(2026, 6)[0]).toEqual({ date: '2026-06-01', inMonth: true });
  });
  it('enero de 2027 cruza de año', () => {
    expect(buildMonthGrid(2027, 1)[0]!.date).toBe('2026-12-28');
  });
  it('agosto de 2027 necesita 6 semanas', () => {
    expect(buildMonthGrid(2027, 8)).toHaveLength(42);
  });
  it('inMonth marca solo los días del mes', () => {
    expect(buildMonthGrid(2026, 11).filter((c) => c.inMonth)).toHaveLength(30);
  });
});

describe('utilidades', () => {
  it('shiftMonth cruza de año', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });
  it('monthTitle', () => {
    expect(monthTitle({ year: 2026, month: 11 })).toBe('Noviembre 2026');
  });
  it('groupByDate pone hitos antes que tareas en el mismo día', () => {
    const task = { kind: 'task' as const, id: 't', title: 'T', dueDate: '2026-11-10', status: 'TODO' as const, projectId: 'p', projectName: 'P', assignees: [] };
    const milestone = { kind: 'milestone' as const, id: 'm', name: 'H', dueDate: '2026-11-10', status: 'PENDING' as const, projectId: 'p', projectName: 'P' };
    expect(groupByDate([task], [milestone]).get('2026-11-10')!.map((e) => e.kind)).toEqual(['milestone', 'task']);
  });
});
