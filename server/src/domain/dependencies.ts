import { diffDays, type DependencyType } from '@pm/shared';

export type DependencyEdge = { predecessorId: string; successorId: string };
export type ProgressState = { status: string; progress: number };
export type ProgressChange = { status?: string; progress?: number };

/**
 * Comprueba si añadir predecessorId → successorId cerraría un ciclo.
 * Devuelve la cadena de ids que formaría el ciclo, o null si no lo hay.
 */
export function findDependencyCycle(edges: DependencyEdge[], predecessorId: string, successorId: string): string[] | null {
  if (predecessorId === successorId) return [successorId, successorId];

  const visited = new Set<string>();
  const walk = (current: string, path: string[]): string[] | null => {
    if (current === predecessorId) return [...path, successorId];
    visited.add(current);
    for (const edge of edges) {
      if (edge.predecessorId !== current || visited.has(edge.successorId)) continue;
      const found = walk(edge.successorId, [...path, edge.successorId]);
      if (found) return found;
    }
    return null;
  };
  return walk(successorId, [successorId]);
}

/** Una predecesora retiene a su sucesora: fin a inicio sin terminar o inicio a inicio sin empezar. */
export const isBlocking = (type: string, status: string) => (type === 'FS' && status !== 'DONE') || (type === 'SS' && status === 'TODO');

const ADVANCING_STATUSES = new Set(['IN_PROGRESS', 'DONE']);

/**
 * Una tarea no puede avanzar, ni por estado ni por porcentaje, si una predecesora fin a inicio no
 * terminó o una inicio a inicio no empezó. Fin a fin e inicio a fin no bloquean el avance.
 */
export function checkProgressChange(current: ProgressState, next: ProgressChange, predecessors: { type: DependencyType; status: string }[]): 'ok' | 'blocked' {
  const blocking = predecessors.some((p) => isBlocking(p.type, p.status));
  if (!blocking) return 'ok';
  const advancesStatus = next.status !== undefined && next.status !== current.status && ADVANCING_STATUSES.has(next.status);
  const advancesProgress = next.progress !== undefined && next.progress > current.progress;
  return advancesStatus || advancesProgress ? 'blocked' : 'ok';
}

type Dates = { startDate: string | null; dueDate: string | null };

/**
 * Las fechas guardadas no respetan la dependencia (S = inicio, F = fin, en días naturales):
 * FS: S suc ≥ F pred + 1 + desfase; SS: S suc ≥ S pred + desfase; FF: F suc ≥ F pred + desfase;
 * SF: F suc ≥ S pred + desfase. Sin alguna de las fechas que la regla usa, no hay conflicto.
 */
export function dependencyViolated(type: DependencyType, lagDays: number, predecessor: Dates, successor: Dates): boolean {
  const [from, to, min] =
    type === 'FS'
      ? [predecessor.dueDate, successor.startDate, 1 + lagDays]
      : type === 'SS'
        ? [predecessor.startDate, successor.startDate, lagDays]
        : type === 'FF'
          ? [predecessor.dueDate, successor.dueDate, lagDays]
          : [predecessor.startDate, successor.dueDate, lagDays];
  if (!from || !to) return false;
  return diffDays(from, to) < min;
}
