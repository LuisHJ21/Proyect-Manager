import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess } from '../auth/access';
import { computeIndicators } from '../domain/indicators';
import { leafWhere } from '../domain/wbs';
import { loadLaborCosts } from './laborCost';

export function indicatorRoutes(app: App) {

  app.get('/api/projects/:id/indicators', async (c) => {
    const { prisma } = c.var.deps;
    const { project, isPm } = await getProjectAccess(c, c.req.param('id'));
    const where = { projectId: project.id };
    const [tasks, milestones] = await Promise.all([prisma.task.findMany({ where: { ...where, ...leafWhere } }), prisma.milestone.findMany({ where })]);
    const pmData = isPm
      ? {
          plannedBudgetCents: Number(project.plannedBudgetCents),
          expenses: [
            ...(await prisma.expense.findMany({ where })).map((e) => ({ amountCents: Number(e.amountCents) })),
            ...(await loadLaborCosts(prisma, [project.id])),
          ],
          risks: await prisma.risk.findMany({ where }),
        }
      : {};
    const progressTasks = tasks.map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents), estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours) }));
    return c.json(computeIndicators({ tasks: progressTasks, milestones, ...pmData }, c.var.deps.today()));
  });
}
