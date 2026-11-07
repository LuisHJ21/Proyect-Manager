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

const ADVANCING_STATUSES = new Set(['IN_PROGRESS', 'DONE']);

/** Una tarea con predecesoras pendientes no puede avanzar, ni por estado ni por porcentaje. */
export function checkProgressChange(current: ProgressState, next: ProgressChange, pendingPredecessors: number): 'ok' | 'blocked' {
  if (pendingPredecessors === 0) return 'ok';
  const advancesStatus = next.status !== undefined && next.status !== current.status && ADVANCING_STATUSES.has(next.status);
  const advancesProgress = next.progress !== undefined && next.progress > current.progress;
  return advancesStatus || advancesProgress ? 'blocked' : 'ok';
}
