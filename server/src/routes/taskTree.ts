import type { Prisma, PrismaClient } from '@prisma/client';
import { buildWbs, MAX_WBS_DEPTH, subtreeHeight, type WbsNode, type WbsTask } from '../domain/wbs';
import { AppError, fieldError } from '../errors';

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
} as const;

/** EDT completa de un proyecto, con las filas listas para resumir. */
export async function loadTree(db: Db, projectId: string): Promise<{ nodes: Map<string, WbsNode>; byId: Map<string, WbsTask> }> {
  const rows = await db.task.findMany({ where: { projectId }, select: wbsSelect });
  const tasks = rows.map((r) => ({ ...r, plannedCostCents: Number(r.plannedCostCents) }));
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

/** Posición para una tarea que llega al final de sus hermanas. */
export async function nextPosition(db: Db, projectId: string, parentId: string | null): Promise<number> {
  const last = await db.task.aggregate({ where: { projectId, parentId }, _max: { position: true } });
  return (last._max.position ?? 0) + 1;
}

/** Intercambia la tarea con su hermana vecina; en un extremo no hace nada. Renumera las hermanas de 1 en adelante. */
export async function moveTask(db: Db, taskId: string, direction: 'up' | 'down'): Promise<void> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, parentId: true } });
  const siblings = await db.task.findMany({
    where: { projectId: task.projectId, parentId: task.parentId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const ids = siblings.map((s) => s.id);
  const index = ids.indexOf(taskId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
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
