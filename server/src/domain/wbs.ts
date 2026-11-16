import type { TaskStatus } from '@pm/shared';
import { weightedProgress } from './indicators';

/** Máximo de niveles de la EDT; una tarea raíz está en el nivel 1. */
export const MAX_WBS_DEPTH = 4;

/** Consulta de Prisma para quedarse con las tareas sin subtareas (las hojas de la EDT). */
export const leafWhere = { children: { none: {} } } as const;

export type WbsTask = {
  id: string;
  parentId: string | null;
  position: number;
  createdAt: Date | string;
  status: string;
  progress: number;
  plannedCostCents: number;
  startDate: string | null;
  dueDate: string | null;
};

export type WbsNode = { code: string; depth: number; childIds: string[]; leafIds: string[]; ancestorIds: string[] };

const time = (value: Date | string) => new Date(value).getTime();

/**
 * Arma la EDT de un proyecto: código (1, 1.2, 1.2.3), profundidad, hijas, hojas descendientes y
 * antecesoras de cada tarea. Las hermanas se ordenan por posición y luego por fecha de creación.
 * Una tarea cuya padre no está en la lista se trata como raíz.
 */
export function buildWbs(tasks: WbsTask[]): Map<string, WbsNode> {
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string | null, WbsTask[]>();
  for (const task of tasks) {
    const parent = task.parentId && ids.has(task.parentId) ? task.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), task]);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position || time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));

  const nodes = new Map<string, WbsNode>();
  const visit = (parentId: string | null, prefix: string, ancestors: string[]): string[] => {
    const leaves: string[] = [];
    (children.get(parentId) ?? []).forEach((task, index) => {
      const code = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      const node: WbsNode = { code, depth: ancestors.length + 1, childIds: (children.get(task.id) ?? []).map((c) => c.id), leafIds: [], ancestorIds: ancestors };
      nodes.set(task.id, node);
      node.leafIds = node.childIds.length === 0 ? [task.id] : visit(task.id, code, [...ancestors, task.id]);
      leaves.push(...node.leafIds);
    });
    return leaves;
  };
  visit(null, '', []);
  return nodes;
}

export const isLeaf = (nodes: Map<string, WbsNode>, id: string) => (nodes.get(id)?.childIds.length ?? 0) === 0;

/** Niveles de la rama que empieza en la tarea; una hoja vale 1. */
export function subtreeHeight(nodes: Map<string, WbsNode>, id: string): number {
  const node = nodes.get(id);
  if (!node || node.childIds.length === 0) return 1;
  return 1 + Math.max(...node.childIds.map((child) => subtreeHeight(nodes, child)));
}

/** Estado de una tarea padre según sus hojas. */
function summaryStatus(statuses: string[]): TaskStatus {
  if (statuses.length > 0 && statuses.every((s) => s === 'DONE')) return 'DONE';
  if (statuses.some((s) => s === 'BLOCKED') && !statuses.includes('IN_PROGRESS')) return 'BLOCKED';
  if (statuses.some((s) => s === 'IN_PROGRESS' || s === 'DONE')) return 'IN_PROGRESS';
  return 'TODO';
}

/** Resumen de una tarea padre a partir de sus hojas descendientes. */
export function summarize(leaves: WbsTask[]): { startDate: string | null; dueDate: string | null; plannedCostCents: number; progress: number; status: TaskStatus } {
  const starts = leaves.map((l) => l.startDate).filter((d): d is string => d !== null).sort();
  const dues = leaves.map((l) => l.dueDate).filter((d): d is string => d !== null).sort();
  return {
    startDate: starts[0] ?? null,
    dueDate: dues.at(-1) ?? null,
    plannedCostCents: leaves.reduce((sum, l) => sum + l.plannedCostCents, 0),
    progress: weightedProgress(leaves),
    status: summaryStatus(leaves.map((l) => l.status)),
  };
}
