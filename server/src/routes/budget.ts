import { budgetCategoriesSchema, EXPENSE_CATEGORY } from '@pm/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readBody, type App } from '../http';
import { requireProjectAccess } from '../auth/access';
import { leafWhere } from '../domain/wbs';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Presupuesto por categoría con lo real de los gastos, las reservas y lo que queda sin asignar.
 * El BAC es el de la última línea base o, sin ella, el costo planeado de las hojas.
 */
export async function loadBudgetCategories(db: Db, projectId: string, teamLaborCents = 0) {
  const [project, planned, spent, baseline, leaves] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { plannedBudgetCents: true, contingencyReserveCents: true, managementReserveCents: true } }),
    db.budgetCategory.findMany({ where: { projectId } }),
    db.expense.groupBy({ by: ['category'], where: { projectId }, _sum: { amountCents: true } }),
    db.baseline.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, select: { bacCents: true } }),
    db.task.aggregate({ where: { projectId, ...leafWhere }, _sum: { plannedCostCents: true } }),
  ]);
  const plannedBy = new Map(planned.map((p) => [p.category, Number(p.plannedCents)]));
  const spentBy = new Map(spent.map((s) => [s.category, Number(s._sum.amountCents ?? 0n)]));
  const items = EXPENSE_CATEGORY.filter((c) => plannedBy.has(c) || spentBy.has(c)).map((category) => ({
    category,
    plannedCents: plannedBy.get(category) ?? 0,
    actualCents: spentBy.get(category) ?? 0,
  }));
  const bac = Number(baseline?.bacCents ?? leaves._sum.plannedCostCents ?? 0n);
  const contingencyCents = Number(project.contingencyReserveCents);
  const managementCents = Number(project.managementReserveCents);
  const unallocatedCents = Number(project.plannedBudgetCents) - bac - contingencyCents - managementCents;
  return { items, teamLaborCents, contingencyCents, managementCents, unallocatedCents, overAllocated: unallocatedCents < 0 };
}

export function budgetRoutes(app: App) {
  const base = '/api/projects/:id/budget-categories';

  app.get(base, async (c) => {
    const project = await requireProjectAccess(c, c.req.param('id'), 'budget', 'read');
    return c.json(await loadBudgetCategories(c.var.deps.prisma, project.id));
  });

  app.put(base, async (c) => {
    const { prisma } = c.var.deps;
    const project = await requireProjectAccess(c, c.req.param('id'), 'budget', 'write');
    const { items } = budgetCategoriesSchema.parse(await readBody(c));
    await prisma.$transaction([
      prisma.budgetCategory.deleteMany({ where: { projectId: project.id } }),
      prisma.budgetCategory.createMany({ data: items.map((i) => ({ projectId: project.id, category: i.category, plannedCents: BigInt(i.plannedCents) })) }),
    ]);
    return c.json(await loadBudgetCategories(prisma, project.id));
  });
}
