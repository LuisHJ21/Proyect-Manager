import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('reservas y presupuesto por categoría', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const url = () => `/api/projects/${project.id}/budget-categories`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana], plannedBudgetCents: 100000 });
  });
  afterEach(() => ctx.close());

  it('el PM fija las reservas y el colaborador no las recibe', async () => {
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { contingencyReserveCents: 5000, managementReserveCents: 2000 });
    expect(res.statusCode).toBe(200);
    expect((await ctx.as(pm).get(`/api/projects/${project.id}`)).json()).toMatchObject({ contingencyReserveCents: 5000, managementReserveCents: 2000 });
    const own = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const listed = (await ctx.as(ana).get('/api/projects')).json()[0];
    for (const body of [own, listed]) {
      expect(body).not.toHaveProperty('contingencyReserveCents');
      expect(body).not.toHaveProperty('managementReserveCents');
    }
  });

  it('presupuesto por categoría con lo real de los gastos', async () => {
    const put = await ctx.as(pm).put(url(), { items: [{ category: 'MATERIALS', plannedCents: 10000 }, { category: 'SERVICES', plannedCents: 3000 }] });
    expect(put.statusCode).toBe(200);
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Cemento', amountCents: 2500n, date: '2026-11-01', category: 'MATERIALS' } });
    const body = (await ctx.as(pm).get(url())).json();
    expect(body.items).toEqual(
      expect.arrayContaining([
        { category: 'MATERIALS', plannedCents: 10000, actualCents: 2500 },
        { category: 'SERVICES', plannedCents: 3000, actualCents: 0 },
      ]),
    );
    expect(body.teamLaborCents).toBe(0);
  });

  it('una categoría repetida da 400 y el colaborador recibe 403', async () => {
    const dup = await ctx.as(pm).put(url(), { items: [{ category: 'MATERIALS', plannedCents: 1 }, { category: 'MATERIALS', plannedCents: 2 }] });
    expect(dup.statusCode).toBe(400);
    expect(JSON.stringify(dup.json().error)).toContain('Cada categoría va una sola vez');
    expect((await ctx.as(ana).put(url(), { items: [] })).statusCode).toBe(403);
    expect((await ctx.as(ana).get(url())).statusCode).toBe(403);
  });

  it('sin asignar puede quedar negativo y lo avisa', async () => {
    await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Obra', plannedCostCents: 80000n } });
    await ctx.as(pm).patch(`/api/projects/${project.id}`, { contingencyReserveCents: 15000, managementReserveCents: 10000 });
    const body = (await ctx.as(pm).get(url())).json();
    expect(body).toMatchObject({ contingencyCents: 15000, managementCents: 10000, unallocatedCents: -5000, overAllocated: true });
  });
});
