import { describe, expect, it } from 'vitest';
import { diffSnapshots, toActivityValue, type Snapshot } from '../../src/domain/activityDiff';

const snap = (values: Snapshot['values'], label = 'Diseño'): Snapshot => ({ label, values });

describe('comparación de fotos para la bitácora', () => {
  it('campo vigilado cambiado guarda anterior y nuevo', () => {
    expect(diffSnapshots(snap({ status: 'IN_PROGRESS' }), snap({ status: 'DONE' }), ['status'])).toEqual([
      { field: 'status', from: 'IN_PROGRESS', to: 'DONE' },
    ]);
  });

  it('campo no vigilado cambiado aparece sin valores', () => {
    expect(diffSnapshots(snap({ description: 'a' }), snap({ description: 'b' }), ['status'])).toEqual([{ field: 'description' }]);
  });

  it('sin cambios no hay nada', () => {
    expect(diffSnapshots(snap({ status: 'DONE', progress: 5 }), snap({ status: 'DONE', progress: 5 }), ['status'])).toEqual([]);
  });

  it('creación y borrado no listan campos', () => {
    expect(diffSnapshots(null, snap({ status: 'DONE' }), ['status'])).toEqual([]);
    expect(diffSnapshots(snap({ status: 'DONE' }), null, ['status'])).toEqual([]);
  });

  it('ignora id, projectId, createdAt y updatedAt', () => {
    const before = snap({ id: 'a', projectId: 'p', createdAt: '1', updatedAt: '1' });
    const after = snap({ id: 'b', projectId: 'q', createdAt: '2', updatedAt: '2' });
    expect(diffSnapshots(before, after, ['id'])).toEqual([]);
  });

  it('las listas se comparan como conjuntos', () => {
    expect(diffSnapshots(snap({ assignees: ['Luis', 'Ana'] }), snap({ assignees: ['Ana', 'Luis'] }), ['assignees'])).toEqual([]);
    expect(diffSnapshots(snap({ assignees: ['Ana'] }), snap({ assignees: ['Luis', 'Ana'] }), ['assignees'])).toEqual([
      { field: 'assignees', from: ['Ana'], to: ['Ana', 'Luis'] },
    ]);
  });

  it('vigilados en el orden dado y luego los demás en orden alfabético', () => {
    const before = snap({ title: 'a', status: 'TODO', progress: 0, description: 'x' });
    const after = snap({ title: 'b', status: 'DONE', progress: 100, description: 'y' });
    expect(diffSnapshots(before, after, ['status', 'progress']).map((c) => c.field)).toEqual(['status', 'progress', 'description', 'title']);
  });

  it('un campo que solo existe en una de las fotos cuenta como cambio a null', () => {
    expect(diffSnapshots(snap({}), snap({ ownerId: 'Ana' }), ['ownerId'])).toEqual([{ field: 'ownerId', from: null, to: 'Ana' }]);
  });

  it('convierte valores', () => {
    expect(toActivityValue(10n)).toBe(10);
    expect(toActivityValue(undefined)).toBeNull();
    expect(toActivityValue(new Date('2026-11-14T10:00:00.000Z'))).toBe('2026-11-14T10:00:00.000Z');
    expect(toActivityValue(['b', 'a'])).toEqual(['a', 'b']);
    expect(toActivityValue('x')).toBe('x');
  });
});
