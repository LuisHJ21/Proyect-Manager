import type { PrismaClient } from '@prisma/client';
import type { DependencyType } from '@pm/shared';
import { dependencyViolated } from './dependencies';
import { fieldError } from '../errors';

type Dates = { startDate: string | null; dueDate: string | null };

export function assertDependencyDate(type: DependencyType, lagDays: number, predecessor: Dates, successor: Dates, title: string, field = 'startDate') {
  if (dependencyViolated(type, lagDays, predecessor, successor)) {
    throw fieldError(field, `Las fechas no respetan la dependencia con «${title}». Ajusta la fecha o el desfase.`);
  }
}

/** Comprueba ambos lados cuando cambian las fechas de una tarea existente. */
export async function assertTaskDependencyDates(prisma: PrismaClient, taskId: string, dates: Dates) {
  const edges = await prisma.taskDependency.findMany({
    where: { OR: [{ predecessorId: taskId }, { successorId: taskId }] },
    include: { predecessor: { select: { title: true, startDate: true, dueDate: true } }, successor: { select: { title: true, startDate: true, dueDate: true } } },
  });
  for (const edge of edges) {
    const outgoing = edge.predecessorId === taskId;
    const field = outgoing ? (edge.type === 'FS' || edge.type === 'FF' ? 'dueDate' : 'startDate') : (edge.type === 'FS' || edge.type === 'SS' ? 'startDate' : 'dueDate');
    assertDependencyDate(edge.type as DependencyType, edge.lagDays, outgoing ? dates : edge.predecessor, outgoing ? edge.successor : dates, outgoing ? edge.successor.title : edge.predecessor.title, field);
  }
}
