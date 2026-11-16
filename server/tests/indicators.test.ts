import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('indicadores por API', () => {
  let ctx: TestCtx;
  let pm: User;
  let member: User;
  let project: Project;
  let url: string;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    member = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [member], plannedBudgetCents: 5000 });
    url = `/api/projects/${project.id}/indicators`;
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 2000, date: '2026-11-01', category: 'OTHER' } });
    await ctx.prisma.risk.create({ data: { projectId: project.id, description: 'R', type: 'THREAT', probability: 5, impact: 5, response: 'ACCEPT' } });
  });
  afterEach(() => ctx.close());

  it('a las 23:30 hora local, una tarea que vence hoy no cuenta como vencida', async () => {
    ctx.clock.set('2026-11-06T23:30:00');
    await ctx.makeTask(project.id, { dueDate: '2026-11-06', status: 'TODO' });
    expect((await ctx.as(pm).get(url)).json().overdueTasks).toBe(0);
  });

  it('al pasar la medianoche local, sí cuenta como vencida', async () => {
    await ctx.makeTask(project.id, { dueDate: '2026-11-06', status: 'TODO' });
    ctx.clock.set('2026-11-07T00:10:00');
    expect((await ctx.as(pm).get(url)).json().overdueTasks).toBe(1);
  });

  it('colaborador no recibe budget ni highRisks', async () => {
    const body = (await ctx.as(member).get(url)).json();
    expect(body).not.toHaveProperty('budget');
    expect(body).not.toHaveProperty('highRisks');
    expect(body.progress).toBe(0);
  });

  it('PM los recibe', async () => {
    const body = (await ctx.as(pm).get(url)).json();
    expect(body.budget).toEqual({ plannedCents: 5000, spentCents: 2000, differenceCents: 3000 });
    expect(body.highRisks).toBe(1);
  });

  it('no miembro recibe 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(url)).statusCode).toBe(404);
  });

  it('la lista de proyectos incluye el avance', async () => {
    await ctx.makeTask(project.id, { progress: 50 });
    await ctx.makeTask(project.id, { progress: 25 });
    const [listed] = (await ctx.as(member).get('/api/projects')).json();
    expect(listed.progress).toBe(38);
  });

  it('el avance se pondera por costo en indicadores, lista de proyectos y panel', async () => {
    await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Chica', progress: 100, plannedCostCents: 10000n } });
    await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Grande', progress: 0, plannedCostCents: 30000n } });
    for (const user of [pm, member]) {
      expect((await ctx.as(user).get(url)).json().progress).toBe(25);
      const listed = (await ctx.as(user).get('/api/projects')).json().find((p: { id: string }) => p.id === project.id);
      expect(listed.progress).toBe(25);
    }
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING' } });
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(dashboard.projects.find((p: { id: string }) => p.id === project.id).progress).toBe(25);
  });
});
