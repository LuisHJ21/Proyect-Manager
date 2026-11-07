import { describe, expect, it } from 'vitest';
import { countTasksOutside, formatRange, isWithinProject } from '../../src/domain/projectDates';

const project = { startDate: '2026-11-01', endDate: '2026-11-30' };

describe('isWithinProject', () => {
  it('primer y último día se aceptan; un día antes o después no', () => {
    expect(isWithinProject('2026-11-01', project)).toBe(true);
    expect(isWithinProject('2026-11-30', project)).toBe(true);
    expect(isWithinProject('2026-10-31', project)).toBe(false);
    expect(isWithinProject('2026-12-01', project)).toBe(false);
  });
  it('cada límite solo aplica si está definido', () => {
    expect(isWithinProject('2030-01-01', { startDate: '2026-11-01', endDate: null })).toBe(true);
    expect(isWithinProject('2020-01-01', { startDate: '2026-11-01', endDate: null })).toBe(false);
    expect(isWithinProject('2020-01-01', { startDate: null, endDate: '2026-11-30' })).toBe(true);
    expect(isWithinProject('2030-01-01', { startDate: null, endDate: '2026-11-30' })).toBe(false);
    expect(isWithinProject('2020-01-01', { startDate: null, endDate: null })).toBe(true);
  });
});

describe('formatRange', () => {
  it('describe los límites definidos', () => {
    expect(formatRange(project)).toBe('2026-11-01 a 2026-11-30');
    expect(formatRange({ startDate: '2026-11-01', endDate: null })).toBe('desde 2026-11-01');
    expect(formatRange({ startDate: null, endDate: '2026-11-30' })).toBe('hasta 2026-11-30');
  });
});

describe('countTasksOutside', () => {
  it('cuenta tareas con alguna fecha fuera, una sola vez cada una', () => {
    const tasks = [
      { startDate: '2026-11-05', dueDate: '2026-11-06' },
      { startDate: '2026-10-05', dueDate: '2026-12-06' },
      { startDate: null, dueDate: '2026-12-06' },
      { startDate: null, dueDate: null },
    ];
    expect(countTasksOutside(tasks, project)).toBe(2);
  });
});
