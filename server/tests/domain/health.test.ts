import { describe, expect, it } from 'vitest';
import { computeHealth, isHighRisk, isOverdue } from '../../src/domain/health';

const base = { status: 'EXECUTING', endDate: '2027-01-01', plannedBudgetCents: 10000, spentCents: 0, overdueTasks: 0, highRisks: 0 };
const health = (over = {}) => computeHealth({ ...base, ...over }, '2026-11-07');

describe('computeHealth', () => {
  it('3 vencidas es riesgo; 2 es atención; 0 al día', () => {
    expect(health({ overdueTasks: 3 })).toBe('AT_RISK');
    expect(health({ overdueTasks: 2 })).toBe('ATTENTION');
    expect(health()).toBe('ON_TRACK');
  });
  it('presupuesto: 89 % al día, 90 % y 100 % atención, más de 100 % riesgo', () => {
    expect(health({ spentCents: 8900 })).toBe('ON_TRACK');
    expect(health({ spentCents: 9000 })).toBe('ATTENTION');
    expect(health({ spentCents: 10000 })).toBe('ATTENTION');
    expect(health({ spentCents: 10001 })).toBe('AT_RISK');
  });
  it('presupuesto 0 no activa condiciones', () => {
    expect(health({ plannedBudgetCents: 0, spentCents: 500 })).toBe('ON_TRACK');
  });
  it('fecha de fin: ayer riesgo; hoy, mañana y vacía no', () => {
    expect(health({ endDate: '2026-11-06' })).toBe('AT_RISK');
    expect(health({ endDate: '2026-11-07' })).toBe('ON_TRACK');
    expect(health({ endDate: '2026-11-08' })).toBe('ON_TRACK');
    expect(health({ endDate: null })).toBe('ON_TRACK');
  });
  it('riesgo alto da atención', () => expect(health({ highRisks: 1 })).toBe('ATTENTION'));
  it('una condición de riesgo gana a una de atención', () => {
    expect(health({ highRisks: 1, overdueTasks: 3 })).toBe('AT_RISK');
  });
  it.each(['CLOSED', 'CANCELLED'])('%s no tiene salud', (status) => {
    expect(health({ status, overdueTasks: 5 })).toBeNull();
  });
  it.each(['PLANNING', 'EXECUTING', 'PAUSED'])('%s sí tiene salud', (status) => {
    expect(health({ status })).toBe('ON_TRACK');
  });
});

describe('isHighRisk e isOverdue', () => {
  it('puntaje 14 no, 15 sí, cerrado no', () => {
    expect(isHighRisk({ probability: 2, impact: 7, status: 'OPEN' })).toBe(false);
    expect(isHighRisk({ probability: 3, impact: 5, status: 'TREATING' })).toBe(true);
    expect(isHighRisk({ probability: 5, impact: 5, status: 'CLOSED' })).toBe(false);
  });
  it('vencida solo si está abierta con fecha anterior a hoy', () => {
    expect(isOverdue({ status: 'TODO', dueDate: '2026-11-06' }, '2026-11-07')).toBe(true);
    expect(isOverdue({ status: 'TODO', dueDate: '2026-11-07' }, '2026-11-07')).toBe(false);
    expect(isOverdue({ status: 'DONE', dueDate: '2026-11-06' }, '2026-11-07')).toBe(false);
    expect(isOverdue({ status: 'TODO', dueDate: null }, '2026-11-07')).toBe(false);
  });
});
