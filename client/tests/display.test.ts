import { describe, expect, it } from 'vitest';
import { initials, normalizeText, projectColor, PROJECT_COLORS, shortDate } from '../src/lib/display';

describe('utilidades de presentación', () => {
  it('initials', () => {
    expect(initials('Beatriz Soto')).toBe('BS');
    expect(initials('Ana')).toBe('A');
    expect(initials('  ana maría  ruiz ')).toBe('AM');
    expect(initials('')).toBe('?');
  });
  it('normalizeText quita acentos y mayúsculas', () => {
    expect(normalizeText('MIGRACIÓN Ñandú')).toBe('migracion nandu');
  });
  it('projectColor es estable y de la lista', () => {
    expect(projectColor('abc')).toBe(projectColor('abc'));
    expect(PROJECT_COLORS).toContain(projectColor('cmw5x6pq30005usxcr5lpmt25'));
  });
  it('shortDate', () => {
    expect(shortDate('2026-11-30')).toBe('30 nov 2026');
    expect(shortDate('2027-01-05')).toBe('5 ene 2027');
    expect(shortDate(null)).toBe('—');
  });
});
