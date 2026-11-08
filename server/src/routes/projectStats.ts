import type { Project, PrismaClient } from '@prisma/client';
import { summarizeProject, type ProjectSummary } from '../domain/health';
import { loadEvmIndexes } from './evmLoader';

/** Calcula el resumen de varios proyectos con una sola tanda de consultas. */
export async function loadProjectSummaries(prisma: PrismaClient, projects: Project[], today: string): Promise<Map<string, ProjectSummary>> {
  const where = { projectId: { in: projects.map((p) => p.id) } };
  const [tasks, risks, expenses, evm] = await Promise.all([
    prisma.task.findMany({ where, select: { projectId: true, status: true, dueDate: true, progress: true } }),
    prisma.risk.findMany({ where, select: { projectId: true, probability: true, impact: true, status: true } }),
    prisma.expense.findMany({ where, select: { projectId: true, amountCents: true } }),
    loadEvmIndexes(prisma, projects.map((p) => p.id), today),
  ]);
  return new Map(
    projects.map((project) => [
      project.id,
      summarizeProject(
        { ...project, plannedBudgetCents: Number(project.plannedBudgetCents) },
        tasks.filter((t) => t.projectId === project.id),
        risks.filter((r) => r.projectId === project.id),
        expenses.filter((e) => e.projectId === project.id).map((e) => ({ amountCents: Number(e.amountCents) })),
        today,
        evm.get(project.id),
      ),
    ]),
  );
}
