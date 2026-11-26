import type { Prisma, PrismaClient } from '@prisma/client';
import { buildWbs, MAX_WBS_DEPTH, subtreeHeight, type WbsNode, type WbsTask } from '../domain/wbs';
import { AppError, fieldError } from '../errors';
import { isWithinProject } from '../domain/projectDates';
import type { TaskTree } from './taskDto';

type Db = PrismaClient | Prisma.TransactionClient;

export const wbsSelect = {
  id: true,
  parentId: true,
  position: true,
  createdAt: true,
  status: true,
  progress: true,
  plannedCostCents: true,
  startDate: true,
  dueDate: true,
  estimatedHours: true,
} as const;

/** EDT completa de un proyecto, con las filas listas para resumir. */
export async function loadTree(db: Db, projectId: string): Promise<TaskTree> {
  const rows = await db.task.findMany({ where: { projectId }, select: wbsSelect });
  const tasks = rows.map((r) => ({ ...r, plannedCostCents: Number(r.plannedCostCents), estimatedHours: r.estimatedHours === null ? null : Number(r.estimatedHours) }));
  return { nodes: buildWbs(tasks), byId: new Map(tasks.map((t) => [t.id, t])) };
}

const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/** Lo que una tarea tiene como trabajo propio y le impide pasar a ser padre. */
async function ownWork(db: Db, taskId: string): Promise<string[]> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { plannedCostCents: true, _count: { select: { assignees: true, steps: true, expenses: true, predecessors: true, successors: true } } },
  });
  const { assignees, steps, expenses, predecessors, successors } = task._count;
  return [
    ...(assignees > 0 ? ['responsables'] : []),
    ...(task.plannedCostCents > 0n ? ['costo planeado'] : []),
    ...(steps > 0 ? [plural(steps, 'paso', 'pasos')] : []),
    ...(expenses > 0 ? [plural(expenses, 'gasto', 'gastos')] : []),
    ...(predecessors + successors > 0 ? ['dependencias'] : []),
  ];
}

/**
 * Comprueba que `parentId` sirve como padre de la tarea (o de una nueva, sin `id`): mismo proyecto,
 * sin ciclos, dentro de los niveles de la EDT y sin trabajo propio en la padre si aún no tiene hijas.
 */
export async function assertParent(db: Db, task: { id?: string; projectId: string }, parentId: string | null | undefined): Promise<void> {
  if (!parentId) return;
  const parent = await db.task.findFirst({ where: { id: parentId, projectId: task.projectId }, select: { id: true } });
  if (!parent) throw fieldError('parentId', 'Elige una tarea de este proyecto');
  const { nodes } = await loadTree(db, task.projectId);
  const parentNode = nodes.get(parentId)!;
  if (task.id && (parentId === task.id || parentNode.ancestorIds.includes(task.id))) {
    throw fieldError('parentId', 'Una tarea no puede quedar dentro de sí misma');
  }
  const height = task.id ? subtreeHeight(nodes, task.id) : 1;
  if (parentNode.depth + height > MAX_WBS_DEPTH) throw fieldError('parentId', `La EDT admite hasta ${MAX_WBS_DEPTH} niveles`);
  if (parentNode.childIds.length === 0) {
    const work = await ownWork(db, parentId);
    if (work.length > 0) {
      throw new AppError(409, 'task_has_work', `Esta tarea tiene trabajo propio. Antes de añadirle subtareas, quita o mueve: ${work.join(', ')}`);
    }
  }
}

/** Las fechas de una subtarea deben caber en las ventanas fijas de todas sus antecesoras. */
export async function assertParentDates(db: Db, parentId: string | null | undefined, dates: { startDate: string | null; dueDate: string | null }) {
  for (let id = parentId; id;) {
    const parent = await db.task.findUniqueOrThrow({ where: { id }, select: { title: true, parentId: true, startDate: true, dueDate: true } });
    for (const field of ['startDate', 'dueDate'] as const) {
      const date = dates[field];
      if (date && !isWithinProject(date, { startDate: parent.startDate, endDate: parent.dueDate })) {
        throw fieldError(field, `La fecha debe estar dentro del intervalo de «${parent.title}» (${parent.startDate ?? 'sin inicio'} a ${parent.dueDate ?? 'sin fin'})`);
      }
    }
    id = parent.parentId;
  }
}

/** Impide estrechar la ventana de una padre dejando alguna subtarea fuera. */
export async function assertChildrenWithinWindow(db: Db, taskId: string, dates: { startDate: string | null; dueDate: string | null }) {
  const descendants = await db.task.findMany({ where: { parentId: taskId }, select: { id: true, title: true, startDate: true, dueDate: true } });
  const stack = [...descendants];
  while (stack.length) {
    const child = stack.pop()!;
    for (const field of ['startDate', 'dueDate'] as const) {
      const date = child[field];
      if (date && !isWithinProject(date, { startDate: dates.startDate, endDate: dates.dueDate })) throw fieldError(field, `El intervalo deja fuera a «${child.title}»`);
    }
    stack.push(...await db.task.findMany({ where: { parentId: child.id }, select: { id: true, title: true, startDate: true, dueDate: true } }));
  }
}

/** Posición para una tarea que llega al final de sus hermanas. */
export async function nextPosition(db: Db, projectId: string, parentId: string | null): Promise<number> {
  const last = await db.task.aggregate({ where: { projectId, parentId }, _max: { position: true } });
  return (last._max.position ?? 0) + 1;
}

/** Intercambia la tarea con su hermana vecina; en un extremo no hace nada. Renumera las hermanas de 1 en adelante. */
export async function moveTask(db: Db, taskId: string, move: 'up' | 'down' | { targetId: string }): Promise<void> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, parentId: true } });
  const siblings = await db.task.findMany({
    where: { projectId: task.projectId, parentId: task.parentId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const ids = siblings.map((s) => s.id);
  const index = ids.indexOf(taskId);
  const target = typeof move === 'string' ? (move === 'up' ? index - 1 : index + 1) : ids.indexOf(move.targetId);
  if (target < 0 || target >= ids.length) return;
  if (typeof move === 'string') [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  else ids.splice(target, 0, ids.splice(index, 1)[0]!);
  for (const [position, id] of ids.entries()) await db.task.update({ where: { id }, data: { position: position + 1 } });
}

export const SUMMARY_FIELD_MESSAGE = 'Se calcula con sus subtareas';

/** Una tarea es padre (resumen) si tiene al menos una subtarea. */
export async function isSummaryTask(db: Db, taskId: string): Promise<boolean> {
  return (await db.task.count({ where: { parentId: taskId } })) > 0;
}

/** Rechaza actualizar el trabajo de una tarea padre: avance, pasos, dependencias y gastos van en sus subtareas. */
export async function assertNotSummary(db: Db, taskId: string): Promise<void> {
  if (await isSummaryTask(db, taskId)) throw new AppError(409, 'task_is_summary', 'Una tarea con subtareas se actualiza a través de ellas');
}

/** Orden EDT (recorrido en profundidad) para ordenar una lista de tareas del proyecto. */
export function inWbsOrder<T extends { id: string }>(tasks: T[], tree: TaskTree): T[] {
  const order = new Map([...tree.nodes.keys()].map((id, index) => [id, index]));
  return [...tasks].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** EDT de varios proyectos, para listas que mezclan tareas de distintos proyectos. */
export async function loadTrees(db: Db, projectIds: string[]): Promise<Map<string, TaskTree>> {
  const unique = [...new Set(projectIds)];
  return new Map(await Promise.all(unique.map(async (id) => [id, await loadTree(db, id)] as const)));
}

/** Rechaza un entregable de otro proyecto. */
export async function assertDeliverable(db: Db, projectId: string, deliverableId: string | null | undefined): Promise<void> {
  if (!deliverableId) return;
  const found = await db.deliverable.findFirst({ where: { id: deliverableId, projectId }, select: { id: true } });
  if (!found) throw fieldError('deliverableId', 'Elige un entregable de este proyecto');
}

/**
 * Al recibir una subtarea, la padre conserva sus fechas como intervalo fijo; avance y estado salen de
 * sus hojas. Se borran los demás valores propios para que no reaparezcan si se queda sin hijas.
 * Sube la versión porque cambia lo que muestra su formulario.
 */
export async function becomeSummary(db: Db, parentId: string | null | undefined): Promise<void> {
  if (!parentId) return;
  await db.task.update({ where: { id: parentId }, data: { progress: 0, status: 'TODO', estimatedHours: null, version: { increment: 1 } } });
}
