import type { Prisma } from '@prisma/client';

export const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true } } } },
  predecessors: { include: { predecessor: { select: { id: true, title: true, status: true, dueDate: true } } } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export type TaskWarning = 'predecessor_not_done' | 'starts_before_predecessor_due';

export function toTaskDto(task: TaskWithRelations) {
  const { assignees, predecessors, ...fields } = task;
  return {
    ...fields,
    assignees: assignees.map((a) => a.user),
    predecessorIds: predecessors.map((p) => p.predecessorId),
    waitingOn: [] as { id: string; title: string }[],
    warnings: [] as TaskWarning[],
  };
}
