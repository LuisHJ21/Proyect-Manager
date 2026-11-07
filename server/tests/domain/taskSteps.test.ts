import { describe, expect, it } from 'vitest';
import { stepProgress } from '../../src/domain/taskSteps';

describe('stepProgress', () => {
  it('es null sin pasos', () => expect(stepProgress([])).toBeNull());
  it('redondea', () => {
    expect(stepProgress([{ done: true }, { done: false }, { done: false }])).toBe(33);
    expect(stepProgress([{ done: true }, { done: true }, { done: false }])).toBe(67);
  });
  it('todo hecho es 100', () => expect(stepProgress([{ done: true }])).toBe(100));
});
