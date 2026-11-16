import { ACTIVE_PROJECT_STATUS, CLOSED_PROJECT_STATUS, closeProjectSchema, reopenProjectSchema } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { buildClosureReport, closurePendings, type ClosureInput, type ClosureReport } from '../domain/closure';
import { AppError, fieldError } from '../errors';
import { sanitizeRichText } from '../richText';
import { loadEvmInput } from './performance';
import { leafWhere } from '../domain/wbs';
import { loadLaborCosts } from './laborCost';

const person = { select: { id: true, name: true } } as const;

/** Reúne lo necesario para calcular pendientes e informe de cierre de un proyecto. */
export async function loadClosureInput(prisma: PrismaClient, projectId: string): Promise<ClosureInput> {
  const status = { select: { status: true } } as const;
  const [project, tasks, deliverables, incidents, risks, objectives, charter, expenses, changes, evm, labor] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { startDate: true, endDate: true, plannedBudgetCents: true, currency: true } }),
    prisma.task.findMany({ where: { projectId, ...leafWhere }, select: { status: true, startDate: true } }),
    prisma.deliverable.findMany({ where: { projectId }, ...status }),
    prisma.incident.findMany({ where: { projectId }, ...status }),
    prisma.risk.findMany({ where: { projectId }, ...status }),
    prisma.objective.findMany({ where: { projectId }, ...status }),
    prisma.charter.findUnique({ where: { projectId }, ...status }),
    prisma.expense.findMany({ where: { projectId }, select: { amountCents: true } }),
    prisma.changeRequest.findMany({ where: { projectId }, ...status }),
    loadEvmInput(prisma, projectId),
    loadLaborCosts(prisma, [projectId]),
  ]);
  return {
    project: { ...project, plannedBudgetCents: Number(project.plannedBudgetCents) },
    tasks,
    deliverables,
    incidents,
    risks,
    objectives,
    charterStatus: charter?.status ?? null,
    expenses: [...expenses.map((e) => ({ amountCents: Number(e.amountCents) })), ...labor.map(({ amountCents }) => ({ amountCents }))],
    changes,
    evm,
  };
}

const isClosed = (status: string) => (CLOSED_PROJECT_STATUS as readonly string[]).includes(status);

export function closureRoutes(app: App) {
  const today = (c: Ctx) => c.var.deps.today();

  /** Estado de cierre del proyecto: informe (en vivo o congelado), cierre vigente e historial. */
  const closureState = async (c: Ctx, projectId: string) => {
    const { prisma } = c.var.deps;
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
    const closures = await prisma.projectClosure.findMany({
      where: { projectId },
      orderBy: { closedAt: 'desc' },
      include: { closedBy: person, reopenedBy: person },
    });
    const closed = isClosed(project.status);
    const current = closed ? (closures.find((x) => !x.reopenedAt) ?? null) : null;
    const report: ClosureReport = current ? JSON.parse(current.report) : buildClosureReport(await loadClosureInput(prisma, projectId), today(c));
    return {
      status: closed ? ('closed' as const) : ('open' as const),
      legacy: closed && !current,
      report,
      current: current
        ? { finalStatus: current.finalStatus, summary: current.summary, pendingReason: current.pendingReason, closedAt: current.closedAt, closedBy: current.closedBy }
        : null,
      history: closures.map((c) => ({
        id: c.id,
        finalStatus: c.finalStatus,
        summary: c.summary,
        pendingReason: c.pendingReason,
        closedAt: c.closedAt,
        closedBy: c.closedBy,
        reopenedAt: c.reopenedAt,
        reopenedBy: c.reopenedBy,
        reopenReason: c.reopenReason,
        report: JSON.parse(c.report) as ClosureReport,
      })),
    };
  };

  app.get('/api/projects/:id/closure', async (c) => {
    const project = await requireProjectAccess(c, c.req.param('id'), 'closure', 'read');
    return c.json(await closureState(c, project.id));
  });

  app.post('/api/projects/:id/closure', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'closure', 'write');
    const user = requireUser(c);
    const input = closeProjectSchema.parse(await readBody(c));
    if (isClosed(project.status)) throw new AppError(409, 'project_already_closed', 'El proyecto ya está cerrado');
    const closureInput = await loadClosureInput(prisma, project.id);
    if (closurePendings(closureInput).length > 0 && !input.pendingReason.trim()) {
      throw fieldError('pendingReason', 'Explica por qué se cierra con pendientes');
    }
    const now = c.var.deps.now();
    const report = buildClosureReport(closureInput, today(c));
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.project.updateMany({
        where: { id: project.id, status: { in: [...ACTIVE_PROJECT_STATUS] } },
        data: { status: input.finalStatus, closedAt: now },
      });
      if (count === 0) throw new AppError(409, 'project_already_closed', 'El proyecto ya está cerrado');
      await tx.projectClosure.create({
        data: {
          projectId: project.id,
          finalStatus: input.finalStatus,
          summary: sanitizeRichText(input.summary),
          pendingReason: input.pendingReason.trim(),
          report: JSON.stringify(report),
          closedAt: now,
          closedById: user.id,
        },
      });
    });
    return c.json(await closureState(c, project.id));
  });

  app.post('/api/projects/:id/reopen', async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'closure', 'write');
    const user = requireUser(c);
    const { reason } = reopenProjectSchema.parse(await readBody(c));
    const now = c.var.deps.now();
    // La foto para un cierre anterior a esta versión se calcula fuera de la transacción.
    const legacyReport = JSON.stringify(buildClosureReport(await loadClosureInput(prisma, project.id), today(c)));
    await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUniqueOrThrow({ where: { id: project.id }, select: { status: true } });
      const { count } = await tx.project.updateMany({
        where: { id: project.id, status: { in: [...CLOSED_PROJECT_STATUS] } },
        data: { status: 'EXECUTING', closedAt: null },
      });
      if (count === 0) throw new AppError(409, 'project_not_closed', 'El proyecto no está cerrado');
      const reopen = { reopenedAt: now, reopenedById: user.id, reopenReason: reason.trim() };
      const current = await tx.projectClosure.findFirst({ where: { projectId: project.id, reopenedAt: null }, orderBy: { closedAt: 'desc' } });
      if (current) {
        await tx.projectClosure.update({ where: { id: current.id }, data: reopen });
      } else {
        await tx.projectClosure.create({
          data: { projectId: project.id, finalStatus: before.status, report: legacyReport, closedAt: now, closedById: user.id, ...reopen },
        });
      }
    });
    return c.json(await closureState(c, project.id));
  });
}
