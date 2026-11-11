import { describe, expect, it } from 'vitest';
import { createProjectSchema, LABELS, lessonSchema, reopenProjectSchema, updateProjectSchema } from '../src';

describe('cierre y lecciones', () => {
  it('el estado del proyecto no admite cerrado', () => {
    const closed = updateProjectSchema.safeParse({ status: 'CLOSED' });
    expect(closed.success).toBe(false);
    expect(closed.error?.issues[0]).toMatchObject({ path: ['status'], message: 'Para cerrar el proyecto usa la pestaña Cierre' });
    expect(createProjectSchema.safeParse({ name: 'X', status: 'CANCELLED' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
  });

  it('lección', () => {
    expect(lessonSchema.safeParse({ type: 'TO_IMPROVE', category: 'COST', situation: ' ' }).success).toBe(false);
    expect(lessonSchema.safeParse({ type: 'TO_IMPROVE', category: 'COST', situation: 'x'.repeat(2001) }).success).toBe(false);
    expect(lessonSchema.parse({ type: 'WORKED_WELL', category: 'TEAM', situation: 'Bien' })).toEqual({ type: 'WORKED_WELL', category: 'TEAM', situation: 'Bien', recommendation: '' });
    expect(LABELS.lessonCategory.PROCUREMENT).toBe('Proveedores');
    expect(LABELS.lessonType).toEqual({ WORKED_WELL: 'Funcionó bien', TO_IMPROVE: 'A mejorar' });
    expect(LABELS.closurePending.charter).toBe('Acta sin aprobar');
  });

  it('reabrir exige motivo', () => {
    expect(reopenProjectSchema.safeParse({ reason: '  ' }).success).toBe(false);
  });
});
