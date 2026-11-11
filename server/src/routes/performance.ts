import { addDays, baselineSchema, CLOSED_PROJECT_STATUS, diffDays, localToday } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { computeEvm, plannedValueAt, type EvmInput } from '../domain/evm';
import { AppError, fieldError } from '../errors';

const MAX_SERIES_POINTS = 730;

const baselineInclude = {
  createdBy: { select: { id: true, name: true } },
  changeRequest: { select: { id: true, number: true, title: true } },
} as const;

/** Datos para calcular el valor ganado de un proyecto, o null si no tiene línea base. */
export async function loadEvmInput(prisma: PrismaClient, projectId: string): Promise<EvmInput | null> {
  const baseline = await prisma.baseline.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, include: { tasks: true } });
  if (!baseline) return null;
  const [project, tasks, expenses] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { plannedBudgetCents: true } }),
    prisma.task.findMany({ where: { projectId }, select: { id: true, title: true, progress: true, dueDate: true, plannedCostCents: true } }),
    prisma.expense.findMany({ where: { projectId }, select: { amountCents: true, date: true, taskId: true } }),
  ]);
  return {
    baseline: {
      bacCents: Number(baseline.bacCents),
      tasks: baseline.tasks.map((t) => ({ taskId: t.taskId, title: t.title, startDate: t.startDate, dueDate: t.dueDate, plannedCostCents: Number(t.plannedCostCents) })),
    },
    tasks: tasks.map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents) })),
    expenses: expenses.map((e) => ({ ...e, amountCents: Number(e.amountCents) })),
    plannedBudgetCents: Number(project.plannedBudgetCents),
  };
}

type BaselineWithRelations = {
  version: number;
  reason: string;
  bacCents: bigint;
  startDate: string | null;
  endDate: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
  changeRequest: { id: string; number: number; title: string } | null;
};

const toBaselineDto = (b: BaselineWithRelations) => ({
  version: b.version,
  reason: b.reason,
  bacCents: Number(b.bacCents),
  startDate: b.startDate,
  endDate: b.endDate,
  createdAt: b.createdAt,
  createdBy: b.createdBy,
  changeRequest: b.changeRequest,
});

export async function performanceRoutes(app: FastifyInstance) {
  const { prisma } = app;

  app.post<{ Params: { id: string } }>('/api/projects/:id/baselines', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const user = requireUser(req);
    const { reason, changeRequestId } = baselineSchema.parse(req.body ?? {});

    const tasks = await prisma.task.findMany({ where: { projectId: project.id, plannedCostCents: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
    if (tasks.length === 0) throw new AppError(400, 'baseline_empty', 'Pon un costo planeado al menos a una tarea antes de fijar la línea base');
    const missing = tasks.filter((t) => !t.startDate || !t.dueDate);
    if (missing.length > 0) {
      throw new AppError(400, 'baseline_missing_dates', 'Todas las tareas con costo necesitan fecha de inicio y de fin', {
        details: { tasks: missing.map((t) => ({ id: t.id, title: t.title })) },
      });
    }
    if (changeRequestId) {
      const approved = await prisma.changeRequest.findFirst({ where: { id: changeRequestId, projectId: project.id, status: 'APPROVED' } });
      if (!approved) throw fieldError('changeRequestId', 'Elige una solicitud de cambio aprobada de este proyecto');
    }

    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.baseline.aggregate({ where: { projectId: project.id }, _max: { version: true } });
      const version = (last._max.version ?? 0) + 1;
      if (version > 1 && !reason) throw fieldError('reason', 'Escribe el motivo de la nueva línea base');
      return tx.baseline.create({
        data: {
          projectId: project.id,
          version,
          reason,
          bacCents: tasks.reduce((sum, t) => sum + t.plannedCostCents, 0n),
          startDate: project.startDate,
          endDate: project.endDate,
          changeRequestId: changeRequestId ?? null,
          createdById: user.id,
          tasks: {
            create: tasks.map((t) => ({ taskId: t.id, title: t.title, startDate: t.startDate!, dueDate: t.dueDate!, plannedCostCents: t.plannedCostCents })),
          },
        },
        include: baselineInclude,
      });
    });
    return reply.status(201).send(toBaselineDto(created));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/performance', async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const history = await prisma.baseline.findMany({ where: { projectId: project.id }, include: baselineInclude, orderBy: { version: 'desc' } });
    const input = await loadEvmInput(prisma, project.id);
    if (!input || history.length === 0) {
      return { baseline: null, history: [], metrics: null, tasks: [], outsideBaseline: 0, series: [] };
    }

    const today = localToday(app.now());
    const { metrics, tasks, outsideBaseline } = computeEvm(input, today);
    const snapshot = { bacCents: BigInt(metrics.bacCents), pvCents: BigInt(metrics.pvCents), evCents: BigInt(metrics.evCents), acCents: BigInt(metrics.acCents) };
    // Un proyecto cerrado no acumula fotos: su curva S queda congelada.
    if (!(CLOSED_PROJECT_STATUS as readonly string[]).includes(project.status)) await prisma.evmSnapshot.upsert({
      where: { projectId_date: { projectId: project.id, date: today } },
      update: snapshot,
      create: { projectId: project.id, date: today, ...snapshot },
    });

    const snapshots = new Map(
      (await prisma.evmSnapshot.findMany({ where: { projectId: project.id } })).map((s) => [s.date, s]),
    );
    const baseTasks = input.baseline.tasks;
    const first = baseTasks.reduce((min, t) => (t.startDate < min ? t.startDate : min), baseTasks[0]?.startDate ?? today);
    const lastDue = baseTasks.reduce((max, t) => (t.dueDate > max ? t.dueDate : max), baseTasks[0]?.dueDate ?? today);
    const from = today < first ? today : first;
    const to = today > lastDue ? today : lastDue;
    // Como mucho unos MAX_SERIES_POINTS días muestreados, más hoy, el último día y los días con foto:
    // una fecha mal escrita (por ejemplo, el año 0026) no puede generar cientos de miles de puntos.
    const step = Math.max(1, Math.ceil((diffDays(from, to) + 1) / MAX_SERIES_POINTS));
    const dates = new Set<string>([today, to]);
    for (let date = from; date <= to; date = addDays(date, step)) dates.add(date);
    for (const date of snapshots.keys()) if (date >= from && date <= to) dates.add(date);
    const series = [];
    for (const date of [...dates].sort()) {
      const snap = snapshots.get(date);
      series.push({
        date,
        pvCents: plannedValueAt(baseTasks, date),
        evCents: snap ? Number(snap.evCents) : null,
        acCents: snap ? Number(snap.acCents) : null,
      });
    }

    return {
      baseline: toBaselineDto(history[0]!),
      history: history.map(toBaselineDto),
      metrics,
      tasks,
      outsideBaseline,
      series,
    };
  });
}
