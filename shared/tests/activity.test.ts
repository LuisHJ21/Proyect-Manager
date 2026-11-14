import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTION, ACTIVITY_ENTITY, LABELS } from '../src';

describe('tipos de la bitácora', () => {
  it('entidades de la especificación', () => {
    expect([...ACTIVITY_ENTITY]).toEqual([
      'project', 'member', 'task', 'step', 'comment', 'attachment', 'objective', 'milestone', 'stakeholder',
      'risk', 'expense', 'raci', 'change', 'incident', 'decision', 'deliverable', 'lesson',
    ]);
  });

  it('acciones de la especificación', () => {
    expect([...ACTIVITY_ACTION]).toEqual([
      'created', 'updated', 'deleted', 'approved', 'closed', 'reopened', 'baselined', 'decided', 'reviewed', 'commented', 'uploaded',
    ]);
  });

  it('cada entidad tiene etiqueta para el filtro', () => {
    for (const entity of ACTIVITY_ENTITY) expect(LABELS.activityEntity[entity]).toBeTruthy();
  });
});
