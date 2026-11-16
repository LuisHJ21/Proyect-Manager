import { describe, expect, it } from 'vitest';
import { isReadyToReach } from '../../src/domain/milestones';

const m = (over: Partial<Parameters<typeof isReadyToReach>[0]> = {}) => ({ status: 'PENDING', tasks: [], deliverables: [], ...over });

describe('isReadyToReach', () => {
  it('sin tareas ni entregables no sugiere nada', () => expect(isReadyToReach(m())).toBe(false));
  it('una tarea sin terminar lo impide', () => expect(isReadyToReach(m({ tasks: [{ status: 'DONE' }, { status: 'IN_PROGRESS' }] }))).toBe(false));
  it('un entregable rechazado lo impide', () => expect(isReadyToReach(m({ tasks: [{ status: 'DONE' }], deliverables: [{ status: 'REJECTED' }] }))).toBe(false));
  it('tareas hechas y entregables aceptados', () => expect(isReadyToReach(m({ tasks: [{ status: 'DONE' }], deliverables: [{ status: 'ACCEPTED' }] }))).toBe(true));
  it('solo tareas hechas', () => expect(isReadyToReach(m({ tasks: [{ status: 'DONE' }] }))).toBe(true));
  it('solo entregables aceptados', () => expect(isReadyToReach(m({ deliverables: [{ status: 'ACCEPTED' }] }))).toBe(true));
  it('un hito ya alcanzado no se sugiere', () => expect(isReadyToReach(m({ status: 'REACHED', tasks: [{ status: 'DONE' }] }))).toBe(false));
});
