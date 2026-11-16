import { describe, expect, it } from 'vitest';
import { forecastDate } from '../../src/domain/milestoneForecast';

const TODAY = '2026-11-17';
const pending = { dueDate: '2026-11-30', status: 'PENDING' };

describe('pronóstico de un hito', () => {
  it('la fecha de fin más tardía de sus hojas sin terminar', () => {
    expect(forecastDate(pending, [{ status: 'TODO', dueDate: '2026-12-05' }, { status: 'IN_PROGRESS', dueDate: '2026-11-20' }, { status: 'DONE', dueDate: '2026-12-20' }], TODAY)).toBe('2026-12-05');
  });
  it('una hoja vencida cuenta como hoy', () => {
    expect(forecastDate({ dueDate: '2026-11-10', status: 'PENDING' }, [{ status: 'TODO', dueDate: '2026-11-12' }], TODAY)).toBe(TODAY);
  });
  it('sin hojas pendientes o sin fecha, la fecha prevista', () => {
    expect(forecastDate(pending, [{ status: 'DONE', dueDate: '2026-12-20' }], TODAY)).toBe('2026-11-30');
    expect(forecastDate(pending, [{ status: 'TODO', dueDate: null }], TODAY)).toBe('2026-11-30');
    expect(forecastDate(pending, [], TODAY)).toBe('2026-11-30');
  });
  it('un hito alcanzado no tiene pronóstico', () => {
    expect(forecastDate({ dueDate: '2026-11-30', status: 'REACHED' }, [{ status: 'TODO', dueDate: '2026-12-05' }], TODAY)).toBeNull();
  });
});
