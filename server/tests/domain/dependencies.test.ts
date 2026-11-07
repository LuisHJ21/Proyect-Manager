import { describe, expect, it } from 'vitest';
import { checkProgressChange, findDependencyCycle } from '../../src/domain/dependencies';

describe('findDependencyCycle', () => {
  const edges = [
    { predecessorId: 'A', successorId: 'B' },
    { predecessorId: 'B', successorId: 'C' },
  ];
  it('devuelve la cadena que cerraría el ciclo', () => {
    expect(findDependencyCycle(edges, 'C', 'A')).toEqual(['A', 'B', 'C', 'A']);
  });
  it('detecta una tarea que depende de sí misma', () => {
    expect(findDependencyCycle(edges, 'A', 'A')).toEqual(['A', 'A']);
  });
  it('acepta una dependencia que no crea ciclos', () => {
    expect(findDependencyCycle(edges, 'A', 'C')).toBeNull();
    expect(findDependencyCycle(edges, 'C', 'D')).toBeNull();
  });
  it('termina con grafos en diamante', () => {
    const diamond = [
      { predecessorId: 'A', successorId: 'B' },
      { predecessorId: 'A', successorId: 'C' },
      { predecessorId: 'B', successorId: 'D' },
      { predecessorId: 'C', successorId: 'D' },
    ];
    expect(findDependencyCycle(diamond, 'D', 'E')).toBeNull();
    expect(findDependencyCycle(diamond, 'D', 'A')).not.toBeNull();
  });
});

describe('checkProgressChange', () => {
  const todo = { status: 'TODO', progress: 0 };
  it('bloquea iniciar o terminar con predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { status: 'IN_PROGRESS' }, 1)).toBe('blocked');
    expect(checkProgressChange(todo, { status: 'DONE' }, 1)).toBe('blocked');
  });
  it('bloquea subir el avance con predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { progress: 10 }, 1)).toBe('blocked');
  });
  it('permite estados que no implican avanzar', () => {
    expect(checkProgressChange(todo, { status: 'BLOCKED' }, 1)).toBe('ok');
    expect(checkProgressChange({ status: 'IN_PROGRESS', progress: 50 }, { progress: 30 }, 1)).toBe('ok');
    expect(checkProgressChange({ status: 'IN_PROGRESS', progress: 50 }, { status: 'IN_PROGRESS' }, 1)).toBe('ok');
  });
  it('no bloquea sin predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { status: 'DONE' }, 0)).toBe('ok');
  });
});
