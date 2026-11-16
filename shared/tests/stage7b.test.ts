import { describe, expect, it } from 'vitest';
import { LABELS } from '../src/enums';
import { convertAssumptionSchema, createAssumptionSchema, createProjectSchema, createRiskSchema, updateAssumptionSchema, updateProjectSchema, updateRiskSchema } from '../src/schemas';

const risk = { description: 'Lluvias', type: 'THREAT', probability: 3, impact: 4, response: 'MITIGATE' };

describe('etapa 7B: esquemas', () => {
  it('el residual va completo o no va', () => {
    const half = createRiskSchema.safeParse({ ...risk, residualProbability: 2 });
    expect(half.success).toBe(false);
    expect(JSON.stringify(half.error)).toContain('Indica probabilidad e impacto residuales juntos');
    expect(createRiskSchema.safeParse({ ...risk, residualProbability: 2, residualImpact: 2, trigger: 'Pronóstico de lluvia', nextReviewDate: '2026-12-01', contingencyCostCents: 5000 }).success).toBe(true);
    expect(updateRiskSchema.safeParse({ residualImpact: 3, version: 1 }).success).toBe(false);
    expect(updateRiskSchema.safeParse({ residualProbability: null, residualImpact: null, version: 1 }).success).toBe(true);
  });

  it('supuestos', () => {
    expect(createAssumptionSchema.parse({ description: 'A' })).toMatchObject({ status: 'PENDING' });
    expect(updateAssumptionSchema.safeParse({ status: 'FALSE' }).success).toBe(false);
    expect(updateAssumptionSchema.safeParse({ status: 'FALSE', version: 2 }).success).toBe(true);
    expect(convertAssumptionSchema.safeParse({ kind: 'risk' }).success).toBe(true);
    expect(convertAssumptionSchema.safeParse({ kind: 'task' }).success).toBe(false);
    expect(LABELS.assumptionStatus.PENDING).toBe('Por validar');
  });

  it('umbrales de salud con valores por defecto y rangos', () => {
    expect(createProjectSchema.parse({ name: 'X' })).toMatchObject({ healthOverdueTasks: 3, healthBudgetPercent: 90, healthIndexMin: 90, highRiskScore: 15 });
    expect(updateProjectSchema.safeParse({ highRiskScore: 26 }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ healthBudgetPercent: 40 }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ healthOverdueTasks: 1, healthIndexMin: 100 }).success).toBe(true);
  });
});
