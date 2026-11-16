import type { Prisma, PrismaClient } from '@prisma/client';
import { entryCostCents } from './timeEntries';

type Db = PrismaClient | Prisma.TransactionClient;

export type LaborCost = { projectId: string; taskId: string; date: string; amountCents: number };

/**
 * Costo de la mano de obra del equipo: una fila por registro de horas, con la misma forma que un
 * gasto, para sumarlo al costo real donde ya se suman los gastos. Las horas nunca tienen fecha
 * futura, así que no hace falta filtrar por fecha.
 */
export async function loadLaborCosts(db: Db, projectIds: string[]): Promise<LaborCost[]> {
  if (projectIds.length === 0) return [];
  const entries = await db.timeEntry.findMany({
    where: { task: { projectId: { in: projectIds } } },
    select: { taskId: true, date: true, hours: true, rateCents: true, task: { select: { projectId: true } } },
  });
  return entries.map((e) => ({ projectId: e.task.projectId, taskId: e.taskId, date: e.date, amountCents: entryCostCents(e.hours, e.rateCents) }));
}

export const laborTotal = (rows: { amountCents: number }[]) => rows.reduce((sum, r) => sum + r.amountCents, 0);
