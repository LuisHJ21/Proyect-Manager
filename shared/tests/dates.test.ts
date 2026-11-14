import { describe, expect, it } from 'vitest';
import { addDays, diffDays, localToday } from '../src/dates';

describe('fechas de calendario', () => {
  it('localToday usa la hora local, no UTC', () => {
    expect(localToday(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
    expect(localToday(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  it('calcula la fecha en la zona indicada', () => {
    const instant = new Date('2026-11-07T01:00:00Z');
    expect(localToday(instant, 'America/Lima')).toBe('2026-11-06');
    expect(localToday(instant, 'UTC')).toBe('2026-11-07');
  });
  it('addDays cruza meses y años', () => {
    expect(addDays('2026-11-30', 14)).toBe('2026-12-14');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('diffDays cuenta días de calendario', () => {
    expect(diffDays('2026-11-01', '2026-12-01')).toBe(30);
  });
});
