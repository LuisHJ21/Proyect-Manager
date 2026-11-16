import { describe, expect, it } from 'vitest';
import { metricStatus } from '../../src/domain/quality';

const at = (iso: string) => new Date(iso);

describe('estado de una métrica de calidad', () => {
  it('mayor es mejor y menor es mejor', () => {
    expect(metricStatus({ target: 90, direction: 'HIGHER_BETTER' }, [{ date: '2026-11-10', value: 95, createdAt: at('2026-11-10T10:00:00Z') }])).toEqual({
      latest: { date: '2026-11-10', value: 95 },
      met: true,
    });
    expect(metricStatus({ target: 2, direction: 'LOWER_BETTER' }, [{ date: '2026-11-10', value: 3, createdAt: at('2026-11-10T10:00:00Z') }]).met).toBe(false);
    expect(metricStatus({ target: 2, direction: 'LOWER_BETTER' }, [{ date: '2026-11-10', value: 2, createdAt: at('2026-11-10T10:00:00Z') }]).met).toBe(true);
  });

  it('sin mediciones no hay estado', () => {
    expect(metricStatus({ target: 1, direction: 'HIGHER_BETTER' }, [])).toEqual({ latest: null, met: null });
  });

  it('cuenta la fecha más reciente y, si empatan, la última registrada', () => {
    const status = metricStatus({ target: 80, direction: 'HIGHER_BETTER' }, [
      { date: '2026-11-12', value: 70, createdAt: at('2026-11-12T09:00:00Z') },
      { date: '2026-11-12', value: 85, createdAt: at('2026-11-12T15:00:00Z') },
      { date: '2026-11-01', value: 99, createdAt: at('2026-11-13T15:00:00Z') },
    ]);
    expect(status).toEqual({ latest: { date: '2026-11-12', value: 85 }, met: true });
  });
});
