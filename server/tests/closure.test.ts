import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('modelos de cierre', () => {
  let ctx: TestCtx;
  let ana: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('el detalle del proyecto incluye closedAt', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    expect(detail).toHaveProperty('closedAt', null);
    expect(await ctx.prisma.lesson.count()).toBe(0);
  });
});

describe('API de cierre', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const url = (suffix = 'closure') => `/api/projects/${project.id}/${suffix}`;
  const close = (body: object) => ctx.as(pm).post(url(), body);
  const stored = () => ctx.prisma.project.findUniqueOrThrow({ where: { id: project.id } });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-11T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana], plannedBudgetCents: 100000 });
    await ctx.prisma.charter.update({ where: { projectId: project.id }, data: { status: 'APPROVED' } });
  });
  afterEach(() => ctx.close());

  it('solo el PM', async () => {
    expect((await ctx.as(ana).get(url())).statusCode).toBe(403);
    expect((await ctx.as(ana).post(url(), { finalStatus: 'CLOSED' })).statusCode).toBe(403);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(url())).statusCode).toBe(404);
  });

  it('abierto con pendientes', async () => {
    await ctx.makeTask(project.id, { status: 'TODO' });
    const body = (await ctx.as(pm).get(url())).json();
    expect(body).toMatchObject({ status: 'open', legacy: false, current: null, history: [] });
    expect(body.report.pendings).toEqual([{ kind: 'tasks', count: 1 }]);
  });

  it('cerrar con pendientes exige motivo', async () => {
    await ctx.makeTask(project.id, { status: 'TODO' });
    const missing = await close({ finalStatus: 'CLOSED' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields.pendingReason).toBe('Explica por qué se cierra con pendientes');
    const ok = await close({ finalStatus: 'CLOSED', pendingReason: 'Se descartó', summary: '<p>Fin</p><script>x</script>' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'closed', current: { finalStatus: 'CLOSED', pendingReason: 'Se descartó', summary: '<p>Fin</p>', closedBy: { id: pm.id, name: 'Paula' } } });
    const saved = await stored();
    expect(saved.status).toBe('CLOSED');
    expect(saved.closedAt?.getTime()).toBe(new Date('2026-11-11T10:00:00').getTime());
  });

  it('sin pendientes no hace falta motivo', async () => {
    await ctx.makeTask(project.id, { status: 'DONE' });
    expect((await close({ finalStatus: 'CANCELLED' })).statusCode).toBe(200);
    expect((await stored()).status).toBe('CANCELLED');
  });

  it('cerrar dos veces', async () => {
    expect((await close({ finalStatus: 'CLOSED' })).statusCode).toBe(200);
    expect((await close({ finalStatus: 'CLOSED' })).statusCode).toBe(409);
    expect(await ctx.prisma.projectClosure.count()).toBe(1);
  });

  it('la foto no cambia', async () => {
    const expense = await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 5000, date: '2026-11-01', category: 'OTHER' } });
    await close({ finalStatus: 'CLOSED' });
    await ctx.prisma.expense.update({ where: { id: expense.id }, data: { amountCents: 9000 } });
    const body = (await ctx.as(pm).get(url())).json();
    expect(body.report.budget).toEqual({ plannedCents: 100000, actualCents: 5000, varianceCents: 95000, currency: 'USD' });
  });

  it('reabrir', async () => {
    await close({ finalStatus: 'CLOSED' });
    const missing = await ctx.as(pm).post(url('reopen'), { reason: ' ' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields.reason).toBeTruthy();
    ctx.clock.set('2026-11-12T09:00:00');
    const ok = await ctx.as(pm).post(url('reopen'), { reason: 'Falta una entrega' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'open', current: null });
    expect(ok.json().history[0]).toMatchObject({ reopenReason: 'Falta una entrega', reopenedBy: { id: pm.id, name: 'Paula' } });
    expect(await stored()).toMatchObject({ status: 'EXECUTING', closedAt: null });
    expect((await ctx.as(pm).post(url('reopen'), { reason: 'Otra vez' })).statusCode).toBe(409);
  });

  it('historial con dos cierres', async () => {
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 1000, date: '2026-11-01', category: 'OTHER' } });
    await close({ finalStatus: 'CLOSED' });
    await ctx.as(pm).post(url('reopen'), { reason: 'Fase 2' });
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G2', amountCents: 2000, date: '2026-11-02', category: 'OTHER' } });
    ctx.clock.set('2026-11-20T10:00:00');
    const body = (await close({ finalStatus: 'CLOSED' })).json();
    expect(body.history).toHaveLength(2);
    expect(body.history[0].report.budget.actualCents).toBe(3000);
    expect(body.history[1].report.budget.actualCents).toBe(1000);
    expect(body.history[1].reopenReason).toBe('Fase 2');
  });

  it('proyecto cerrado antes de esta versión', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const body = (await ctx.as(pm).get(url())).json();
    expect(body).toMatchObject({ status: 'closed', legacy: true, current: null, history: [] });
    expect(body.report.budget.plannedCents).toBe(100000);
    const reopened = await ctx.as(pm).post(url('reopen'), { reason: 'Revisión' });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().history).toHaveLength(1);
    expect(reopened.json().history[0]).toMatchObject({ finalStatus: 'CLOSED', reopenReason: 'Revisión' });
  });

  it('PATCH de estado bloqueado', async () => {
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { status: 'CLOSED' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.status).toBe('Para cerrar el proyecto usa la pestaña Cierre');
  });

  it('no se toman fotos de valor ganado con el proyecto cerrado', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', startDate: '2026-11-01', dueDate: '2026-11-10', status: 'DONE' });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 1000 } });
    await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    await close({ finalStatus: 'CLOSED' });
    const before = await ctx.prisma.evmSnapshot.count();
    expect((await ctx.as(pm).get(url('performance'))).statusCode).toBe(200);
    expect(await ctx.prisma.evmSnapshot.count()).toBe(before);
  });
});
