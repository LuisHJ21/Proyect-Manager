import { timeEntrySchema, updateTimeEntrySchema } from '@pm/shared';
import type { Prisma } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { requireUser } from '../auth/guards';
import { fieldError, forbidden, notFound } from '../errors';
import { getTaskAccess } from './tasks';
import { assertNotSummary } from './taskTree';

const entryInclude = { user: { select: { id: true, name: true } } } as const;
type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

/** Costo de un registro: horas por la tarifa congelada, redondeado al centavo. */
export const entryCostCents = (hours: Prisma.Decimal | number, rateCents: bigint | number) => Math.round(Number(hours) * Number(rateCents));

/** La tarifa y el costo solo van al PM. */
function toEntryDto(entry: EntryRow, isPm: boolean) {
  const { rateCents, hours, userId: _userId, ...fields } = entry;
  return {
    ...fields,
    hours: Number(hours),
    ...(isPm ? { rateCents: Number(rateCents), costCents: entryCostCents(hours, rateCents) } : {}),
  };
}

export function timeEntryRoutes(app: App) {
  const base = '/api/tasks/:id/time-entries';
  const today = (c: Ctx) => c.var.deps.today();
  const assertNotFuture = (c: Ctx, date: string | undefined) => {
    if (date && date > today(c)) throw fieldError('date', 'No se registran horas futuras');
  };

  /** Lee como los comentarios: el observador no ve el trabajo registrado. */
  const access = async (c: Ctx) => {
    const result = await getTaskAccess(c, c.req.param('id')!);
    if (!result.can.read('comments')) throw forbidden();
    return result;
  };

  const findEntry = async (c: Ctx, taskId: string) => {
    const entry = await c.var.deps.prisma.timeEntry.findFirst({ where: { id: c.req.param('entryId'), taskId }, include: entryInclude });
    if (!entry) throw notFound('Registro de horas no encontrado');
    return entry;
  };

  /** Edita o borra quien registró la entrada, o el PM. */
  const requireOwnerOrPm = (entry: EntryRow, userId: string, isPm: boolean) => {
    if (!isPm && entry.userId !== userId) throw forbidden('Solo puedes cambiar tus propios registros de horas');
  };

  app.get(base, async (c) => {
    const { task, isPm } = await access(c);
    const entries = await c.var.deps.prisma.timeEntry.findMany({ where: { taskId: task.id }, include: entryInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    return c.json(entries.map((e) => toEntryDto(e, isPm)));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { task, isPm, isAssignee } = await access(c);
    const user = requireUser(c);
    if (!isPm && !isAssignee) throw forbidden('Solo registran horas el PM y los responsables de la tarea');
    await assertNotSummary(prisma, task.id);
    const input = timeEntrySchema.parse(await readBody(c));
    assertNotFuture(c, input.date);
    const entry = await prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: task.projectId, userId: user.id } }, select: { hourlyRateCents: true } });
      return tx.timeEntry.create({
        data: { taskId: task.id, userId: user.id, date: input.date, hours: input.hours, note: input.note, rateCents: member?.hourlyRateCents ?? 0n },
        include: entryInclude,
      });
    });
    return c.json(toEntryDto(entry, isPm), 201);
  });

  app.patch(`${base}/:entryId`, async (c) => {
    const { task, isPm } = await access(c);
    const entry = await findEntry(c, task.id);
    requireOwnerOrPm(entry, requireUser(c).id, isPm);
    const input = updateTimeEntrySchema.parse(await readBody(c));
    assertNotFuture(c, input.date);
    const updated = await c.var.deps.prisma.timeEntry.update({ where: { id: entry.id }, data: input, include: entryInclude });
    return c.json(toEntryDto(updated, isPm));
  });

  app.delete(`${base}/:entryId`, async (c) => {
    const { task, isPm } = await access(c);
    const entry = await findEntry(c, task.id);
    requireOwnerOrPm(entry, requireUser(c).id, isPm);
    await c.var.deps.prisma.timeEntry.delete({ where: { id: entry.id } });
    return c.json({ ok: true });
  });
}
