import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTION } from '../src/enums';
import { createProjectSchema, pauseProjectSchema, resumeDaysQuery, resumeProjectSchema, updateProjectSchema } from '../src/schemas';

describe('etapa 8: esquemas', () => {
  it('la pausa exige motivo', () => {
    const empty = pauseProjectSchema.safeParse({ reason: '  ' });
    expect(empty.success).toBe(false);
    expect(JSON.stringify(empty.error)).toContain('Indica el motivo de la pausa');
    expect(pauseProjectSchema.parse({ reason: 'Prioridad de gerencia', priorityProjectId: 'p2' })).toEqual({ reason: 'Prioridad de gerencia', priorityProjectId: 'p2' });
  });

  it('los días de reanudación van de 0 a 365 enteros', () => {
    expect(resumeProjectSchema.safeParse({ days: 0, createBaseline: false }).success).toBe(true);
    expect(resumeProjectSchema.safeParse({ days: 365, createBaseline: true }).success).toBe(true);
    for (const days of [-1, 366, 1.5]) {
      const r = resumeProjectSchema.safeParse({ days, createBaseline: true });
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error)).toContain('Usa un número de días entre 0 y 365');
    }
    expect(resumeDaysQuery.parse({})).toEqual({});
    expect(resumeDaysQuery.parse({ days: '3' })).toEqual({ days: 3 });
    expect(resumeDaysQuery.safeParse({ days: '400' }).success).toBe(false);
  });

  it('un proyecto no se crea en pausa', () => {
    const r = createProjectSchema.safeParse({ name: 'X', status: 'PAUSED' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain('Usa Pausar o Reanudar proyecto');
    expect(updateProjectSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
  });

  it('compartir lecciones', () => {
    expect(createProjectSchema.parse({ name: 'X' }).shareLessons).toBe(true);
    expect(updateProjectSchema.parse({ shareLessons: false })).toEqual({ shareLessons: false });
  });

  it('acciones de pausa en la bitácora', () => {
    expect(ACTIVITY_ACTION).toEqual(expect.arrayContaining(['paused', 'resumed']));
  });
});
