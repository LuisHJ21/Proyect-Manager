import { describe, expect, it } from 'vitest';
import { checkProgressChange, dependencyViolated, findDependencyCycle } from '../../src/domain/dependencies';

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
  const fs = { type: 'FS' as const, status: 'IN_PROGRESS' };
  it('bloquea iniciar o terminar con predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { status: 'IN_PROGRESS' }, [fs])).toBe('blocked');
    expect(checkProgressChange(todo, { status: 'DONE' }, [fs])).toBe('blocked');
  });
  it('bloquea subir el avance con predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { progress: 10 }, [fs])).toBe('blocked');
  });
  it('permite estados que no implican avanzar', () => {
    expect(checkProgressChange(todo, { status: 'BLOCKED' }, [fs])).toBe('ok');
    expect(checkProgressChange({ status: 'IN_PROGRESS', progress: 50 }, { progress: 30 }, [fs])).toBe('ok');
    expect(checkProgressChange({ status: 'IN_PROGRESS', progress: 50 }, { status: 'IN_PROGRESS' }, [fs])).toBe('ok');
  });
  it('no bloquea sin predecesoras pendientes', () => {
    expect(checkProgressChange(todo, { status: 'DONE' }, [])).toBe('ok');
  });
});

describe('checkProgressChange por tipo', () => {
  const todo = { status: 'TODO', progress: 0 };
  it('SS sin empezar impide empezar; SS en curso no', () => {
    expect(checkProgressChange(todo, { status: 'IN_PROGRESS' }, [{ type: 'SS', status: 'TODO' }])).toBe('blocked');
    expect(checkProgressChange(todo, { progress: 10 }, [{ type: 'SS', status: 'TODO' }])).toBe('blocked');
    expect(checkProgressChange(todo, { status: 'IN_PROGRESS' }, [{ type: 'SS', status: 'IN_PROGRESS' }])).toBe('ok');
  });
  it('FF y SF no bloquean el avance', () => {
    expect(checkProgressChange(todo, { status: 'DONE' }, [{ type: 'FF', status: 'TODO' }, { type: 'SF', status: 'TODO' }])).toBe('ok');
  });
});

describe('dependencyViolated', () => {
  const pred = { startDate: '2026-12-01', dueDate: '2026-12-10' };
  const at = (startDate: string | null, dueDate: string | null) => ({ startDate, dueDate });
  it('FS: la sucesora empieza al día siguiente del fin, más el desfase', () => {
    expect(dependencyViolated('FS', 0, pred, at('2026-12-11', null))).toBe(false);
    expect(dependencyViolated('FS', 0, pred, at('2026-12-10', null))).toBe(true);
    expect(dependencyViolated('FS', 2, pred, at('2026-12-12', null))).toBe(true);
    expect(dependencyViolated('FS', 2, pred, at('2026-12-13', null))).toBe(false);
  });
  it('FS con desfase negativo permite solaparse', () => {
    expect(dependencyViolated('FS', -2, pred, at('2026-12-09', null))).toBe(false);
    expect(dependencyViolated('FS', -2, pred, at('2026-12-08', null))).toBe(true);
  });
  it('SS, FF y SF', () => {
    expect(dependencyViolated('SS', 1, pred, at('2026-12-02', null))).toBe(false);
    expect(dependencyViolated('SS', 1, pred, at('2026-12-01', null))).toBe(true);
    expect(dependencyViolated('FF', 0, pred, at(null, '2026-12-10'))).toBe(false);
    expect(dependencyViolated('FF', 0, pred, at(null, '2026-12-09'))).toBe(true);
    expect(dependencyViolated('SF', 0, pred, at(null, '2026-12-01'))).toBe(false);
    expect(dependencyViolated('SF', 0, pred, at(null, '2026-11-30'))).toBe(true);
  });
  it('sin la fecha que la regla necesita no hay conflicto', () => {
    expect(dependencyViolated('FS', 0, at('2026-12-01', null), at('2026-11-01', null))).toBe(false);
  });
});

