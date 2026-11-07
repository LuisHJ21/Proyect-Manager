import { ACTIVE_PROJECT_STATUS, localToday } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { requirePm } from '../auth/guards';
import { buildDashboard } from '../domain/dashboard';

export async function dashboardRoutes(app: FastifyInstance) {
  const { prisma } = app;

  app.get('/api/dashboard', async (req) => {
    requirePm(req);
    const projects = await prisma.project.findMany({
      where: { status: { in: [...ACTIVE_PROJECT_STATUS] } },
      include: { members: { include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } } },
    });
    const where = { projectId: { in: projects.map((p) => p.id) } };
    const [tasks, risks, expenses, milestones] = await Promise.all([
      prisma.task.findMany({
        where,
        include: { assignees: { include: { user: { select: { id: true, name: true, role: true, active: true } } } } },
      }),
      prisma.risk.findMany({ where }),
      prisma.expense.findMany({ where }),
      prisma.milestone.findMany({ where }),
    ]);

    return buildDashboard(
      {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          endDate: p.endDate,
          plannedBudgetCents: Number(p.plannedBudgetCents),
          team: p.members.map((m) => m.user),
        })),
        tasks: tasks.map((t) => ({ ...t, assignees: t.assignees.map((a) => a.user) })),
        risks,
        expenses: expenses.map((e) => ({ projectId: e.projectId, amountCents: Number(e.amountCents) })),
        milestones,
      },
      localToday(app.now()),
    );
  });
}
