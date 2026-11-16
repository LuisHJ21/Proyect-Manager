import { describe, expect, it } from 'vitest';
import { accessLevel } from '../src/access';
import { LABELS } from '../src/enums';
import {
  changeRequestSchema,
  createQualityMetricSchema,
  createRequirementSchema,
  deliverableReviewSchema,
  measurementSchema,
  proposeChangeSchema,
  updateIncidentSchema,
  updateRequirementSchema,
} from '../src/schemas';

describe('etapa 7A: permisos y esquemas', () => {
  it('requisitos y calidad: el PM escribe y los demás leen', () => {
    for (const section of ['requirements', 'quality'] as const) {
      expect(accessLevel('PM', section)).toBe('write');
      expect(accessLevel('COLLABORATOR', section)).toBe('read');
      expect(accessLevel('OBSERVER', section)).toBe('read');
    }
  });

  it('la no conformidad solo acompaña un rechazo', () => {
    const accepted = deliverableReviewSchema.safeParse({ outcome: 'ACCEPTED', reviewedOn: '2026-11-16', nonconformity: { title: 'X' } });
    expect(accepted.success).toBe(false);
    expect(JSON.stringify(accepted.error)).toContain('Solo se registra una no conformidad al rechazar');
    expect(deliverableReviewSchema.safeParse({ outcome: 'REJECTED', reviewedOn: '2026-11-16', nonconformity: { title: 'X' } }).success).toBe(true);
  });

  it('requisito con valores por defecto y edición versionada', () => {
    expect(createRequirementSchema.parse({ description: 'A' })).toMatchObject({ priority: 'MEDIUM', status: 'PROPOSED', deliverableIds: [], acceptance: '' });
    expect(createRequirementSchema.safeParse({ description: '' }).success).toBe(false);
    expect(updateRequirementSchema.safeParse({ status: 'MET' }).success).toBe(false);
    expect(updateRequirementSchema.safeParse({ status: 'MET', version: 1 }).success).toBe(true);
  });

  it('métricas, mediciones, incidentes y cambios', () => {
    expect(createQualityMetricSchema.parse({ name: 'Cobertura', target: 80 })).toMatchObject({ direction: 'HIGHER_BETTER', unit: '' });
    expect(measurementSchema.safeParse({ date: '2026-11-16', value: Number.NaN }).success).toBe(false);
    expect(measurementSchema.parse({ date: '2026-11-16', value: 3.5 })).toMatchObject({ note: '' });
    expect(updateIncidentSchema.safeParse({ kind: 'DEFECT', version: 1 }).success).toBe(true);
    expect(changeRequestSchema.parse({ title: 'A' }).requirementIds).toEqual([]);
    expect(proposeChangeSchema.parse({ title: 'A', requirementIds: ['r1'] }).requirementIds).toEqual(['r1']);
    expect(LABELS.requirementStatus.MET).toBe('Cumplido');
    expect(LABELS.incidentKind.NONCONFORMITY).toBe('No conformidad');
    expect(LABELS.metricDirection.LOWER_BETTER).toBe('Menor es mejor');
  });
});
