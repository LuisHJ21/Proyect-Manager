import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('lista de proyectos ampliada', () => {
  let ctx: TestCtx;
  let pm: User;
  let c: User;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    c = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos' });
  });
  afterEach(() => ctx.close());

  const seed = async () => {
    const p = await ctx.makeProject({ name: 'Portal', members: [c], plannedBudgetCents: 1000 });
    await ctx.makeTask(p.id, { dueDate: '2026-11-01' });
    await ctx.prisma.risk.create({ data: { projectId: p.id, description: 'R', type: 'THREAT', probability: 5, impact: 5, response: 'ACCEPT' } });
    await ctx.prisma.expense.create({ data: { projectId: p.id, description: 'G', amountCents: 500, date: '2026-11-01', category: 'OTHER' } });
    return p;
  };

  it('PM recibe health, overdueTasks, highRisks, spentCents y team', async () => {
    await seed();
    const [p] = (await ctx.as(pm).get('/api/projects')).json();
    expect(p).toMatchObject({ health: 'ATTENTION', overdueTasks: 1, highRisks: 1, spentCents: 500, team: [{ id: c.id, name: 'Carlos' }] });
  });

  it('colaborador recibe progress y team, y ninguno de health, overdueTasks, highRisks ni spentCents', async () => {
    await seed();
    const [p] = (await ctx.as(c).get('/api/projects')).json();
    expect(p.team).toEqual([{ id: c.id, name: 'Carlos' }]);
    expect(p.progress).toBe(0);
    for (const hidden of ['health', 'overdueTasks', 'highRisks', 'spentCents', 'plannedBudgetCents', 'currency']) {
      expect(p).not.toHaveProperty(hidden);
    }
  });

  it('proyecto cerrado tiene health null', async () => {
    const p = await ctx.makeProject();
    await ctx.prisma.project.update({ where: { id: p.id }, data: { status: 'CLOSED' } });
    expect((await ctx.as(pm).get('/api/projects')).json()[0].health).toBeNull();
  });

  it('el detalle de una tarea incluye commentCount', async () => {
    const p = await seed();
    const task = await ctx.makeTask(p.id, { assignees: [c] });
    await ctx.as(c).post(`/api/tasks/${task.id}/comments`, { body: 'Hola' });
    const list = (await ctx.as(pm).get(`/api/projects/${p.id}/tasks`)).json();
    expect(list.find((t: { id: string }) => t.id === task.id).commentCount).toBe(1);
  });
});
