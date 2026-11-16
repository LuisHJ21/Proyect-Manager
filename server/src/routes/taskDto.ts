import type { Prisma } from '@prisma/client';
import { summarize, type WbsNode, type WbsTask } from '../domain/wbs';

/** EDT del proyecto de la tarea, para el código y el resumen de las padres. */
export type TaskTree = { nodes: Map<string, WbsNode>; byId: Map<string, WbsTask> };

export const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true } } } },
  predecessors: { include: { predecessor: { select: { id: true, title: true, status: true, dueDate: true } } } },
  steps: { select: { done: true } },
  _count: { select: { successors: true, comments: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export type TaskWarning = 'predecessor_not_done' | 'starts_before_predecessor_due';

/** El costo planeado solo se envía al Project Manager, y como número: un BigInt no se puede convertir a JSON. */
export function toTaskDto(task: TaskWithRelations, includeCost: boolean, tree: TaskTree) {
  const { assignees, predecessors, steps, _count, plannedCostCents, estimatedHours, ...fields } = task;
  const waitingOn = predecessors
    .filter((p) => p.predecessor.status !== 'DONE')
    .map((p) => ({ id: p.predecessor.id, title: p.predecessor.title }));

  const warnings: TaskWarning[] = [];
  if (waitingOn.length > 0 && (task.status === 'IN_PROGRESS' || task.status === 'DONE')) {
    warnings.push('predecessor_not_done');
  }
  const { startDate } = task;
  if (startDate && predecessors.some((p) => p.predecessor.dueDate && startDate < p.predecessor.dueDate)) {
    warnings.push('starts_before_predecessor_due');
  }

  const node = tree.nodes.get(task.id);
  const childCount = node?.childIds.length ?? 0;
  // Una padre no tiene trabajo propio: fechas, costo, avance y estado salen de sus hojas.
  const summary = childCount > 0 ? summarize(node!.leafIds.map((id) => tree.byId.get(id)!)) : null;
  const cost = summary ? summary.plannedCostCents : Number(plannedCostCents);

  return {
    ...fields,
    estimatedHours: summary ? summary.estimatedHours : estimatedHours === null ? null : Number(estimatedHours),
    ...(summary ? { startDate: summary.startDate, dueDate: summary.dueDate, progress: summary.progress, status: summary.status } : {}),
    ...(includeCost ? { plannedCostCents: cost } : {}),
    wbsCode: node?.code ?? '',
    childCount,
    isSummary: childCount > 0,
    assignees: assignees.map((a) => a.user),
    predecessorIds: predecessors.map((p) => p.predecessorId),
    successorCount: _count.successors,
    commentCount: _count.comments,
    stepsDone: steps.filter((s) => s.done).length,
    stepsTotal: steps.length,
    waitingOn,
    warnings,
  };
}
