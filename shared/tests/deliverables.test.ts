import { describe, expect, it } from 'vitest';
import { canAccept, canTransition, criterionSchema, deliverableSchema, isDeliverableOverdue, LABELS } from '../src';

describe('reglas de entregables', () => {
  it('canAccept', () => {
    expect(canAccept([])).toBe(false);
    expect(canAccept([{ met: true }, { met: false }])).toBe(false);
    expect(canAccept([{ met: true }])).toBe(true);
  });

  it('vencido', () => {
    const today = '2026-11-11';
    expect(isDeliverableOverdue({ dueDate: null, status: 'PENDING' }, today)).toBe(false);
    expect(isDeliverableOverdue({ dueDate: '2026-11-10', status: 'PENDING' }, today)).toBe(true);
    expect(isDeliverableOverdue({ dueDate: '2026-11-10', status: 'ACCEPTED' }, today)).toBe(false);
    expect(isDeliverableOverdue({ dueDate: today, status: 'IN_REVIEW' }, today)).toBe(false);
  });

  it('transiciones', () => {
    expect(canTransition('PENDING', 'IN_REVIEW')).toBe(true);
    expect(canTransition('ACCEPTED', 'PENDING')).toBe(true);
    expect(canTransition('REJECTED', 'IN_REVIEW')).toBe(true);
    expect(canTransition('PENDING', 'ACCEPTED')).toBe(false);
    expect(canTransition('IN_REVIEW', 'ACCEPTED')).toBe(false);
    expect(canTransition('ACCEPTED', 'IN_REVIEW')).toBe(false);
    expect(canTransition('PENDING', 'PENDING')).toBe(false);
  });

  it('esquemas', () => {
    expect(deliverableSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
    expect(deliverableSchema.safeParse({ name: 'Portal', criteria: ['A'] }).success).toBe(true);
    expect(criterionSchema.safeParse({ text: '  ' }).success).toBe(false);
    expect(LABELS.deliverableStatus.IN_REVIEW).toBe('En revisión');
    expect(LABELS.reviewOutcome).toEqual({ ACCEPTED: 'Aceptado', REJECTED: 'Rechazado' });
  });
});
