import type { Prisma } from '@prisma/client';

export const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true } } } },
  predecessors: { include: { predecessor: { select: { id: true, title: true, status: true, dueDate: true } } } },
  steps: { select: { done: true } },
  _count: { select: { successors: true, comments: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export type TaskWarning = 'predecessor_not_done' | 'starts_before_predecessor_due';

/** El costo planeado solo se envía al Project Manager, y como número: un BigInt no se puede convertir a JSON. */
export function toTaskDto(task: TaskWithRelations, includeCost: boolean) {
  const { assignees, predecessors, steps, _count, plannedCostCents, ...fields } = task;
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

  return {
    ...fields,
    ...(includeCost ? { plannedCostCents: Number(plannedCostCents) } : {}),
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
