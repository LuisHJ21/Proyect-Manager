import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('GET /api/dashboard', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('colaborador recibe 403 y anónimo 401', async () => {
    const c = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(c).get('/api/dashboard')).statusCode).toBe(403);
    expect((await ctx.anon.get('/api/dashboard')).statusCode).toBe(401);
  });

  it('devuelve el panel con equipo y salud', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const c = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos Vega' });
    const p = await ctx.makeProject({ name: 'Portal', members: [c] });
    await ctx.makeTask(p.id, { title: 'Vencida', dueDate: '2026-11-01', assignees: [c] });
    const body = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(body.totals.overdueTasks).toBe(1);
    expect(body.projects[0]).toMatchObject({ name: 'Portal', health: 'ATTENTION', team: [{ id: c.id, name: 'Carlos Vega' }] });
    expect(body.attention[0]).toMatchObject({ kind: 'task', title: 'Vencida', projectId: p.id, projectName: 'Portal' });
    expect(body.workload).toEqual([{ userId: c.id, name: 'Carlos Vega', openTasks: 1, overdueTasks: 1 }]);
  });

  it('los totales funcionan con montos sobre 2.147.483.647 centavos', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const p = await ctx.makeProject({ plannedBudgetCents: 5_000_000_000 });
    await ctx.prisma.expense.create({ data: { projectId: p.id, description: 'G', amountCents: 6_000_000_000, date: '2026-11-01', category: 'OTHER' } });
    const res = await ctx.as(pm).get('/api/dashboard');
    expect(res.statusCode).toBe(200);
    expect(res.json().totals.overBudgetProjects).toBe(1);
    expect(res.json().projects[0].health).toBe('AT_RISK');
  });
});
