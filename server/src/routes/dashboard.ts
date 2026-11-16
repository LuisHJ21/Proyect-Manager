import { ACTIVE_PROJECT_STATUS } from '@pm/shared';
import { readBody, type App, type Ctx } from '../http';
import { requirePm } from '../auth/guards';
import { buildDashboard } from '../domain/dashboard';
import { isReportDue } from '../domain/statusReport';
import { thresholdsOf } from '../domain/health';
import { loadEvmIndexes } from './evmLoader';
import { leafWhere } from '../domain/wbs';
import { loadLaborCosts } from './laborCost';

export function dashboardRoutes(app: App) {

  app.get('/api/dashboard', async (c) => {
    const { prisma } = c.var.deps;
    requirePm(c);
    const projects = await prisma.project.findMany({
      where: { status: { in: [...ACTIVE_PROJECT_STATUS] } },
      include: { members: { include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } } },
    });
    const where = { projectId: { in: projects.map((p) => p.id) } };
    const [tasks, risks, expenses, milestones, incidents, deliverables, changes, labor, reportEnds] = await Promise.all([
      prisma.task.findMany({
        where: { ...where, ...leafWhere },
        include: { assignees: { include: { user: { select: { id: true, name: true, role: true, active: true } } } } },
      }),
      prisma.risk.findMany({ where }),
      prisma.expense.findMany({ where }),
      prisma.milestone.findMany({ where }),
      prisma.incident.findMany({
        where: { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { id: true, number: true, title: true, projectId: true, priority: true, status: true, dueDate: true },
      }),
      prisma.deliverable.findMany({
        where: { ...where, status: { not: 'ACCEPTED' }, dueDate: { not: null } },
        select: { id: true, number: true, name: true, projectId: true, status: true, dueDate: true },
      }),
      prisma.changeRequest.findMany({ where: { ...where, status: 'APPROVED' }, select: { id: true, number: true, title: true, projectId: true } }),
      loadLaborCosts(prisma, projects.map((p) => p.id)),
      prisma.statusReport.groupBy({ by: ['projectId'], where, _max: { periodEnd: true } }),
    ]);
    const lastReportEnd = new Map(reportEnds.map((r) => [r.projectId, r._max.periodEnd]));
    const today = c.var.deps.today();
    const evm = await loadEvmIndexes(prisma, projects.map((p) => p.id), today);

    return c.json(buildDashboard(
      {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          endDate: p.endDate,
          plannedBudgetCents: Number(p.plannedBudgetCents),
          team: p.members.map((m) => m.user),
          evm: evm.get(p.id),
          thresholds: thresholdsOf(p),
          reportDue: isReportDue(p.statusReportFrequency, lastReportEnd.get(p.id) ?? null, p.startDate, today),
        })),
        tasks: tasks.map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents), estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours), assignees: t.assignees.map((a) => a.user) })),
        risks,
        expenses: [...expenses.map((e) => ({ projectId: e.projectId, amountCents: Number(e.amountCents) })), ...labor.map(({ projectId, amountCents }) => ({ projectId, amountCents }))],
        milestones,
        incidents,
        deliverables,
        changes,
        capacities: projects.flatMap((p) => p.members.map((m) => ({ userId: m.userId, projectId: p.id, hours: m.weeklyCapacityHours }))),
      },
      today,
    ));
  });
}
