import { statusReportSchema, toPlainText } from '@pm/shared';
import type { PrismaClient, Project, StatusReport } from '@prisma/client';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { buildStatusReport, isReportDue, reportPeriod, stripMoney, type StatusReportInput, type StatusReportSnapshot } from '../domain/statusReport';
import { isActiveProject, thresholdsOf } from '../domain/health';
import { leafWhere } from '../domain/wbs';
import { forbidden, notFound } from '../errors';
import { notify } from '../notifications';
import { sanitizeRichText } from '../richText';
import { loadLaborCosts } from './laborCost';
import { loadEvmInput } from './performance';

const person = { select: { id: true, name: true } } as const;
type ReportRow = StatusReport & { issuedBy: { id: string; name: string } };

/** Datos del proyecto para el informe, con las marcas de tiempo ya pasadas a fecha local. */
async function loadStatusReportInput(prisma: PrismaClient, project: Project, dateOf: (d: Date) => string): Promise<StatusReportInput> {
  const projectId = project.id;
  const [tasks, milestones, risks, incidents, changes, expenses, labor, evm] = await Promise.all([
    prisma.task.findMany({ where: { projectId, ...leafWhere }, select: { status: true, dueDate: true, startDate: true, progress: true, plannedCostCents: true, estimatedHours: true } }),
    prisma.milestone.findMany({ where: { projectId }, select: { name: true, dueDate: true, status: true } }),
    prisma.risk.findMany({ where: { projectId }, select: { description: true, probability: true, impact: true, status: true } }),
    prisma.incident.findMany({ where: { projectId }, select: { status: true, createdAt: true, resolvedAt: true } }),
    prisma.changeRequest.findMany({ where: { projectId }, select: { status: true, decidedAt: true, appliedAt: true } }),
    prisma.expense.findMany({ where: { projectId }, select: { amountCents: true } }),
    loadLaborCosts(prisma, [projectId]),
    loadEvmInput(prisma, projectId),
  ]);
  const day = (d: Date | null) => (d ? dateOf(d) : null);
  return {
    project: { status: project.status, endDate: project.endDate, plannedBudgetCents: Number(project.plannedBudgetCents), currency: project.currency },
    tasks: tasks.map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents), estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours) })),
    milestones,
    risks: risks.map((r) => ({ ...r, description: toPlainText(r.description) })),
    incidents: incidents.map((i) => ({ status: i.status, createdOn: dateOf(i.createdAt), resolvedOn: day(i.resolvedAt) })),
    changes: changes.map((c) => ({ status: c.status, decidedOn: day(c.decidedAt), appliedOn: day(c.appliedAt) })),
    thresholds: thresholdsOf(project),
    actualCostCents: expenses.reduce((sum, e) => sum + Number(e.amountCents), 0) + labor.reduce((sum, l) => sum + l.amountCents, 0),
    evm,
  };
}

const projectStart = (project: Project, dateOf: (d: Date) => string) => project.startDate ?? dateOf(project.createdAt);

/** Montos solo para el PM. */
function toReportDto(row: ReportRow, isPm: boolean) {
  const snapshot = JSON.parse(row.report) as StatusReportSnapshot;
  return {
    id: row.id,
    number: row.number,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    issuedAt: row.issuedAt,
    issuedBy: row.issuedBy,
    comment: row.comment,
    nextSteps: row.nextSteps,
    report: isPm ? snapshot : stripMoney(snapshot),
  };
}

export function statusReportRoutes(app: App) {
  const base = '/api/projects/:id/status-reports';

  const access = async (c: Ctx, need: 'read' | 'write') => {
    const result = await getProjectAccess(c, c.req.param('id')!);
    if (need === 'write' ? !result.can.write('reports') : !result.can.read('reports')) throw forbidden();
    return result;
  };
  const lastEnd = async (prisma: PrismaClient, projectId: string) =>
    (await prisma.statusReport.findFirst({ where: { projectId }, orderBy: { number: 'desc' }, select: { periodEnd: true } }))?.periodEnd ?? null;

  app.get(base, async (c) => {
    const { prisma, today } = c.var.deps;
    const { project, isPm } = await access(c, 'read');
    const rows = await prisma.statusReport.findMany({ where: { projectId: project.id }, orderBy: { number: 'desc' }, include: { issuedBy: person } });
    return c.json({
      items: rows.map((r) => ({ id: r.id, number: r.number, periodStart: r.periodStart, periodEnd: r.periodEnd, issuedAt: r.issuedAt, issuedBy: r.issuedBy })),
      // Solo el PM recibe el aviso, y solo con el proyecto activo.
      due: isPm && isActiveProject(project.status) && isReportDue(project.statusReportFrequency, rows[0]?.periodEnd ?? null, project.startDate, today()),
    });
  });

  app.get(`${base}/draft`, async (c) => {
    const { prisma, today, dateOf } = c.var.deps;
    const { project, isPm } = await access(c, 'read');
    if (!isPm) throw forbidden();
    const period = reportPeriod(await lastEnd(prisma, project.id), projectStart(project, dateOf), today());
    return c.json({ ...period, report: buildStatusReport(await loadStatusReportInput(prisma, project, dateOf), period, today()) });
  });

  app.post(base, async (c) => {
    const { prisma, today, dateOf } = c.var.deps;
    const { project } = await access(c, 'write');
    const user = requireUser(c);
    const input = statusReportSchema.parse(await readBody(c));
    const data = await loadStatusReportInput(prisma, project, dateOf);
    const row = await prisma.$transaction(async (tx) => {
      const { lastStatusReportNumber: number } = await tx.project.update({
        where: { id: project.id },
        data: { lastStatusReportNumber: { increment: 1 } },
        select: { lastStatusReportNumber: true },
      });
      const previous = await tx.statusReport.findFirst({ where: { projectId: project.id }, orderBy: { number: 'desc' }, select: { periodEnd: true } });
      const period = reportPeriod(previous?.periodEnd ?? null, projectStart(project, dateOf), today());
      return tx.statusReport.create({
        data: {
          projectId: project.id,
          number,
          ...period,
          report: JSON.stringify(buildStatusReport(data, period, today())),
          comment: sanitizeRichText(input.comment),
          nextSteps: sanitizeRichText(input.nextSteps),
          issuedById: user.id,
        },
        include: { issuedBy: person },
      });
    });
    await notify(prisma, {
      kind: 'STATUS_REPORT_ISSUED',
      projectId: project.id,
      entityId: row.id,
      title: `Informe ${row.number}`,
      actorId: user.id,
      actorName: user.name,
      userIds: async () => (await prisma.projectMember.findMany({ where: { projectId: project.id, user: { role: 'OBSERVER' } }, select: { userId: true } })).map((m) => m.userId),
    });
    return c.json(toReportDto(row, true), 201);
  });

  app.get(`${base}/:reportId`, async (c) => {
    const { project, isPm } = await access(c, 'read');
    const row = await c.var.deps.prisma.statusReport.findFirst({ where: { id: c.req.param('reportId'), projectId: project.id }, include: { issuedBy: person } });
    if (!row) throw notFound('Informe no encontrado');
    return c.json(toReportDto(row, isPm));
  });
}
