import type { ActivityChange, ActivityValue } from '@pm/shared';

export type { ActivityValue };

/** Lo que la bitácora sabe de un elemento en un momento: su nombre y sus valores ya legibles. */
export type Snapshot = { label: string; values: Record<string, ActivityValue> };

const IGNORED = new Set(['id', 'projectId', 'createdAt', 'updatedAt']);

/** Normaliza un valor de Prisma para guardarlo en JSON y compararlo. */
export function toActivityValue(value: unknown): ActivityValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(String).sort((a, b) => a.localeCompare(b));
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

const same = (a: ActivityValue, b: ActivityValue) =>
  Array.isArray(a) || Array.isArray(b) ? JSON.stringify(toActivityValue(a)) === JSON.stringify(toActivityValue(b)) : a === b;

/**
 * Cambios entre dos fotos. Los campos vigilados llevan valor anterior y nuevo, en el orden de `watched`;
 * los demás que cambiaron van después, en orden alfabético y sin valores. Crear o borrar no lista campos.
 */
export function diffSnapshots(before: Snapshot | null, after: Snapshot | null, watched: readonly string[]): ActivityChange[] {
  if (!before || !after) return [];
  const read = (snapshot: Snapshot, field: string) => toActivityValue(snapshot.values[field]);
  const changed = (field: string) => !IGNORED.has(field) && !same(read(before, field), read(after, field));
  const valued = watched.filter(changed).map((field) => ({ field, from: read(before, field), to: read(after, field) }));
  const others = [...new Set([...Object.keys(before.values), ...Object.keys(after.values)])]
    .filter((field) => !watched.includes(field) && changed(field))
    .sort()
    .map((field) => ({ field }));
  return [...valued, ...others];
}
