import { addDays, baselineSchema, CLOSED_PROJECT_STATUS, diffDays } from '@pm/shared';
import type { Prisma, PrismaClient, Project } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { computeEvm, plannedValueAt, type EvmInput } from '../domain/evm';
import { AppError, fieldError } from '../errors';
import { leafWhere } from '../domain/wbs';
import { loadLaborCosts } from './laborCost';

const MAX_SERIES_POINTS = 730;

const baselineInclude = {
  createdBy: { select: { id: true, name: true } },
  changeRequest: { select: { id: true, number: true, title: true } },
} as const;

/** Datos para calcular el valor ganado de un proyecto, o null si no tiene línea base. */
export async function loadEvmInput(prisma: PrismaClient, projectId: string): Promise<EvmInput | null> {
  const baseline = await prisma.baseline.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, include: { tasks: true } });
  if (!baseline) return null;
  const [project, tasks, expenses, labor] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { plannedBudgetCents: true, contingencyReserveCents: true, managementReserveCents: true } }),
    prisma.task.findMany({ where: { projectId, ...leafWhere }, select: { id: true, title: true, progress: true, dueDate: true, plannedCostCents: true } }),
    prisma.expense.findMany({ where: { projectId }, select: { amountCents: true, date: true, taskId: true } }),
    loadLaborCosts(prisma, [projectId]),
  ]);
  return {
    baseline: {
      bacCents: Number(baseline.bacCents),
      tasks: baseline.tasks.map((t) => ({ taskId: t.taskId, title: t.title, startDate: t.startDate, dueDate: t.dueDate, plannedCostCents: Number(t.plannedCostCents) })),
    },
    tasks: tasks.map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents) })),
    // La mano de obra del equipo cuenta como costo real, ligada a su tarea.
    expenses: [...expenses.map((e) => ({ ...e, amountCents: Number(e.amountCents) })), ...labor.map(({ taskId, date, amountCents }) => ({ taskId, date, amountCents }))],
    plannedBudgetCents: Number(project.plannedBudgetCents),
    contingencyCents: Number(project.contingencyReserveCents),
    managementCents: Number(project.managementReserveCents),
  };
}

/**
 * Guarda (o actualiza) la foto de valor ganado del día. Un proyecto cerrado no acumula fotos: su
 * curva S queda congelada. Devuelve false si no hay foto que guardar (cerrado o sin línea base).
 */
export async function saveEvmSnapshot(prisma: PrismaClient, projectId: string, today: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project || (CLOSED_PROJECT_STATUS as readonly string[]).includes(project.status)) return false;
  const input = await loadEvmInput(prisma, projectId);
  if (!input) return false;
  const { metrics } = computeEvm(input, today);
  const snapshot = { bacCents: BigInt(metrics.bacCents), pvCents: BigInt(metrics.pvCents), evCents: BigInt(metrics.evCents), acCents: BigInt(metrics.acCents) };
  await prisma.evmSnapshot.upsert({
    where: { projectId_date: { projectId, date: today } },
    update: snapshot,
    create: { projectId, date: today, ...snapshot },
  });
  return true;
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

const BASELINE_EMPTY = 'Pon un costo planeado al menos a una tarea antes de fijar la línea base';
const BASELINE_MISSING_DATES = 'Todas las tareas con costo necesitan fecha de inicio y de fin';

/** Por qué no se podría fijar una línea base ahora, o null si se puede (lo usa la vista previa de reanudar). */
export async function baselineProblem(db: Prisma.TransactionClient, projectId: string): Promise<string | null> {
  const tasks = await db.task.findMany({ where: { projectId, plannedCostCents: { gt: 0 }, ...leafWhere }, select: { startDate: true, dueDate: true } });
  if (tasks.length === 0) return BASELINE_EMPTY;
  return tasks.some((t) => !t.startDate || !t.dueDate) ? BASELINE_MISSING_DATES : null;
}

/**
 * Fija una nueva línea base con las tareas que tienen costo. La usan `POST /baselines` y aplicar un
 * cambio, dentro de su transacción. Quien llama comprueba que la solicitud citada sea válida.
 */
export async function createBaseline(
  tx: Prisma.TransactionClient,
  project: Project,
  userId: string,
  input: { reason: string; changeRequestId: string | null },
) {
  const tasks = await tx.task.findMany({ where: { projectId: project.id, plannedCostCents: { gt: 0 }, ...leafWhere }, orderBy: { createdAt: 'asc' } });
  if (tasks.length === 0) throw new AppError(400, 'baseline_empty', BASELINE_EMPTY);
  const missing = tasks.filter((t) => !t.startDate || !t.dueDate);
  if (missing.length > 0) {
    throw new AppError(400, 'baseline_missing_dates', BASELINE_MISSING_DATES, {
      details: { tasks: missing.map((t) => ({ id: t.id, title: t.title })) },
    });
  }
  const last = await tx.baseline.aggregate({ where: { projectId: project.id }, _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;
  if (version > 1 && !input.reason) throw fieldError('reason', 'Escribe el motivo de la nueva línea base');
  return tx.baseline.create({
    data: {
      projectId: project.id,
      version,
      reason: input.reason,
      bacCents: tasks.reduce((sum, t) => sum + t.plannedCostCents, 0n),
      startDate: project.startDate,
      endDate: project.endDate,
      changeRequestId: input.changeRequestId,
      createdById: userId,
      tasks: {
        create: tasks.map((t) => ({ taskId: t.id, title: t.title, startDate: t.startDate!, dueDate: t.dueDate!, plannedCostCents: t.plannedCostCents })),
      },
    },
    include: baselineInclude,
  });
}

export function performanceRoutes(app: App) {

  app.post('/api/projects/:id/baselines', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'performance', 'write');
    const user = requireUser(c);
    const { reason, changeRequestId } = baselineSchema.parse(await readBody(c) ?? {});

    if (changeRequestId) {
      const cited = await prisma.changeRequest.findFirst({ where: { id: changeRequestId, projectId: project.id, status: { in: ['APPROVED', 'APPLIED'] } } });
      if (!cited) throw fieldError('changeRequestId', 'Elige una solicitud de cambio aprobada de este proyecto');
    }
    const created = await prisma.$transaction((tx) => createBaseline(tx, project, user.id, { reason, changeRequestId: changeRequestId ?? null }));
    return c.json(toBaselineDto(created), 201);
  });

  app.get('/api/projects/:id/performance', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'performance', 'read');
    const history = await prisma.baseline.findMany({ where: { projectId: project.id }, include: baselineInclude, orderBy: { version: 'desc' } });
    const input = await loadEvmInput(prisma, project.id);
    if (!input || history.length === 0) {
      return c.json({ baseline: null, history: [], metrics: null, tasks: [], outsideBaseline: 0, outsideBaselineCostCents: 0, series: [] });
    }

    const today = c.var.deps.today();
    // Solo lectura: la foto de cada día la guarda la tarea diaria; el punto de hoy se calcula al momento.
    const { metrics, tasks, outsideBaseline, outsideBaselineCostCents } = computeEvm(input, today);

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
      const live = date === today;
      series.push({
        date,
        pvCents: plannedValueAt(baseTasks, date),
        evCents: live ? metrics.evCents : snap ? Number(snap.evCents) : null,
        acCents: live ? metrics.acCents : snap ? Number(snap.acCents) : null,
      });
    }

    return c.json({
      baseline: toBaselineDto(history[0]!),
      history: history.map(toBaselineDto),
      metrics,
      tasks,
      outsideBaseline,
      outsideBaselineCostCents,
      series,
    });
  });
}
