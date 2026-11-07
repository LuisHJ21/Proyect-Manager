import { localToday } from '@pm/shared';
import type { FastifyInstance } from 'fastify';
import { getProjectAccess } from '../auth/access';
import { computeIndicators } from '../domain/indicators';

export async function indicatorRoutes(app: FastifyInstance) {
  const { prisma } = app;

  app.get<{ Params: { id: string } }>('/api/projects/:id/indicators', async (req) => {
    const { project, isPm } = await getProjectAccess(req, req.params.id);
    const where = { projectId: project.id };
    const [tasks, milestones] = await Promise.all([prisma.task.findMany({ where }), prisma.milestone.findMany({ where })]);
    const pmData = isPm
      ? {
          plannedBudgetCents: Number(project.plannedBudgetCents),
          expenses: (await prisma.expense.findMany({ where })).map((e) => ({ amountCents: Number(e.amountCents) })),
          risks: await prisma.risk.findMany({ where }),
        }
      : {};
    return computeIndicators({ tasks, milestones, ...pmData }, localToday(app.now()));
  });
}
