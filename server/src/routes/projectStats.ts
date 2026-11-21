import type { Project, PrismaClient } from '@prisma/client';
import { summarizeProject, thresholdsOf, type ProjectSummary } from '../domain/health';
import { loadEvmIndexes } from './evmLoader';
import { leafWhere } from '../domain/wbs';
import { loadLaborCosts } from './laborCost';
import { groupByProject } from '../domain/groupByProject';

/** Calcula el resumen de varios proyectos con una sola tanda de consultas. */
export async function loadProjectSummaries(prisma: PrismaClient, projects: Project[], today: string): Promise<Map<string, ProjectSummary>> {
  const where = { projectId: { in: projects.map((p) => p.id) } };
  const [tasks, risks, expenses, evm, labor] = await Promise.all([
    prisma.task.findMany({ where: { ...where, ...leafWhere }, select: { projectId: true, status: true, startDate: true, dueDate: true, progress: true, plannedCostCents: true, estimatedHours: true } }),
    prisma.risk.findMany({ where, select: { projectId: true, probability: true, impact: true, status: true } }),
    prisma.expense.findMany({ where, select: { projectId: true, amountCents: true } }),
    loadEvmIndexes(prisma, projects.map((p) => p.id), today),
    loadLaborCosts(prisma, projects.map((p) => p.id)),
  ]);
  const tasksByProject = groupByProject(tasks);
  const risksByProject = groupByProject(risks);
  const expensesByProject = groupByProject(expenses);
  const laborByProject = groupByProject(labor);
  return new Map(
    projects.map((project) => [
      project.id,
      summarizeProject(
        { ...project, plannedBudgetCents: Number(project.plannedBudgetCents) },
        (tasksByProject.get(project.id) ?? []).map((t) => ({ ...t, plannedCostCents: Number(t.plannedCostCents), estimatedHours: t.estimatedHours === null ? null : Number(t.estimatedHours) })),
        risksByProject.get(project.id) ?? [],
        [...(expensesByProject.get(project.id) ?? []).map((e) => ({ amountCents: Number(e.amountCents) })), ...(laborByProject.get(project.id) ?? [])],
        today,
        evm.get(project.id),
        thresholdsOf(project),
      ),
    ]),
  );
}
