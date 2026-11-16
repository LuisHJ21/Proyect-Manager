import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('la mano de obra del equipo en el costo real', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let task: Task;
  const TODAY = '2026-11-16';
  const logHours = (taskId: string, hours: number, rateCents = 2000) =>
    ctx.prisma.timeEntry.create({ data: { taskId, userId: ana.id, date: TODAY, hours, rateCents: BigInt(rateCents) } });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ name: 'Portal', members: [ana], plannedBudgetCents: 30000 });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING' } });
    task = await ctx.makeTask(project.id, { title: 'Obra', startDate: '2026-11-01', dueDate: '2026-11-30', progress: 50, assignees: [ana] });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 100000n } });
    await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    await logHours(task.id, 10);
  });
  afterEach(() => ctx.close());

  it('valor ganado: costo real, costo ligado y costo fuera de la línea base', async () => {
    const extra = await ctx.makeTask(project.id, { title: 'Extra', assignees: [ana] });
    await logHours(extra.id, 5);
    const perf = (await ctx.as(pm).get(`/api/projects/${project.id}/performance`)).json();
    expect(perf.metrics.acCents).toBe(30000);
    expect(perf.tasks.find((t: { taskId: string }) => t.taskId === task.id).linkedCostCents).toBe(20000);
    expect(perf.outsideBaselineCostCents).toBe(10000);
  });

  it('indicadores, lista de proyectos, panel, cierre y presupuesto por categoría', async () => {
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Cemento', amountCents: 15000n, date: TODAY, category: 'MATERIALS' } });
    const indicators = (await ctx.as(pm).get(`/api/projects/${project.id}/indicators`)).json();
    expect(indicators.budget.spentCents).toBe(35000);
    const listed = (await ctx.as(pm).get('/api/projects')).json().find((p: { id: string }) => p.id === project.id);
    expect(listed.spentCents).toBe(35000);
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(dashboard.totals.overBudgetProjects).toBe(1);
    const closure = (await ctx.as(pm).get(`/api/projects/${project.id}/closure`)).json();
    expect(closure.report.budget.actualCents).toBe(35000);
    const budget = (await ctx.as(pm).get(`/api/projects/${project.id}/budget-categories`)).json();
    expect(budget.teamLaborCents).toBe(20000);
  });

  it('el colaborador no recibe el costo en los indicadores', async () => {
    const indicators = (await ctx.as(ana).get(`/api/projects/${project.id}/indicators`)).json();
    expect(indicators).not.toHaveProperty('budget');
  });
});
