import type { ChangeRequest, Project, User } from '@prisma/client';
import { DATE_ORDER_MESSAGE } from '@pm/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('aplicar un cambio', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let cr: ChangeRequest;
  const base = () => `/api/projects/${project.id}/change-requests`;
  const apply = (body: object, user = pm, id = cr.id) => ctx.as(user).post(`${base()}/${id}/apply`, body);
  const make = async (status: string, title = 'Agregar blog') => {
    const created = (await ctx.as(pm).post(base(), { title, scheduleImpactDays: 10, costImpactCents: 5000 })).json();
    if (status !== 'PENDING') {
      await ctx.as(pm).post(`${base()}/${created.id}/decision`, { status: status === 'APPLIED' ? 'APPROVED' : status, note: 'Ok' });
    }
    if (status === 'APPLIED') await ctx.as(pm).post(`${base()}/${created.id}/apply`, { baseline: false });
    return ctx.prisma.changeRequest.findUniqueOrThrow({ where: { id: created.id } });
  };
  const current = () => ctx.prisma.project.findUniqueOrThrow({ where: { id: project.id } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana], plannedBudgetCents: 100000 });
    project = await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-01-01', endDate: '2026-06-30' } });
    const task = await ctx.makeTask(project.id, { title: 'Diseño', startDate: '2026-02-01', dueDate: '2026-05-31' });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 80000n } });
    cr = await make('APPROVED');
  });
  afterEach(() => ctx.close());

  it('actualiza la fecha de fin y el presupuesto y deja constancia', async () => {
    const res = await apply({ endDate: '2026-07-10', plannedBudgetCents: 105000, baseline: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'APPLIED', appliedBy: { id: pm.id, name: 'Paula' } });
    expect(res.json().appliedAt).toBeTruthy();
    expect(res.json()).not.toHaveProperty('appliedById');
    const updated = await current();
    expect(updated.endDate).toBe('2026-07-10');
    expect(Number(updated.plannedBudgetCents)).toBe(105000);
    expect(await ctx.prisma.baseline.count()).toBe(0);
  });

  it('con baseline fija una línea base que cita el cambio', async () => {
    expect((await apply({ baseline: true })).statusCode).toBe(200);
    const [baseline] = await ctx.prisma.baseline.findMany();
    expect(baseline).toMatchObject({ version: 1, changeRequestId: cr.id, reason: 'CR-1 Agregar blog' });
  });

  it('respeta el motivo escrito', async () => {
    await apply({ baseline: true, reason: 'Nuevo alcance' });
    expect((await ctx.prisma.baseline.findFirstOrThrow()).reason).toBe('Nuevo alcance');
  });

  it('si la línea base falla no aplica nada', async () => {
    await ctx.prisma.task.updateMany({ data: { plannedCostCents: 0n } });
    const res = await apply({ endDate: '2026-07-10', plannedBudgetCents: 105000, baseline: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('baseline_empty');
    expect((await ctx.prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } })).status).toBe('APPROVED');
    const unchanged = await current();
    expect(unchanged.endDate).toBe('2026-06-30');
    expect(Number(unchanged.plannedBudgetCents)).toBe(100000);
  });

  it('solo se aplica un cambio aprobado', async () => {
    for (const status of ['PENDING', 'REJECTED', 'APPLIED']) {
      const other = await make(status, `Cambio ${status}`);
      const res = await apply({ baseline: false }, pm, other.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'change_not_approved', message: 'Solo se aplica un cambio aprobado' });
    }
  });

  it('dos aplicaciones a la vez: una sola gana', async () => {
    const results = await Promise.all([apply({ baseline: true }), apply({ baseline: true })]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await ctx.prisma.baseline.count()).toBe(1);
  });

  it('una fecha de fin que deja tareas fuera se rechaza sin cambios', async () => {
    const res = await apply({ endDate: '2026-03-01', baseline: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.endDate).toBe('1 tarea quedaría fuera del proyecto. Ajusta sus fechas primero.');
    expect((await current()).endDate).toBe('2026-06-30');
    expect((await ctx.prisma.changeRequest.findUniqueOrThrow({ where: { id: cr.id } })).status).toBe('APPROVED');
  });

  it('una fecha de fin antes del inicio se rechaza', async () => {
    const res = await apply({ endDate: '2025-12-01', baseline: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.startDate).toBe(DATE_ORDER_MESSAGE);
  });

  it('exige baseline', async () => {
    const res = await apply({});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.baseline).toBeTruthy();
  });

  it('el colaborador recibe 403', async () => {
    expect((await apply({ baseline: false }, ana)).statusCode).toBe(403);
  });

  it('después de aplicar se puede fijar una línea base citando el cambio', async () => {
    await apply({ baseline: false });
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, { changeRequestId: cr.id });
    expect(res.statusCode).toBe(201);
    expect(res.json().changeRequest).toMatchObject({ id: cr.id });
  });
});
