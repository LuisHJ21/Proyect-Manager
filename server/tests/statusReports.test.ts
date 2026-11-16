import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('informes de estado', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  const TODAY = '2026-11-16';
  const url = () => `/api/projects/${project.id}/status-reports`;
  const issue = async (body: object = {}) => {
    const res = await ctx.as(pm).post(url(), body);
    expect(res.statusCode).toBe(201);
    return res.json();
  };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs], plannedBudgetCents: 50000 });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING', startDate: '2026-11-01' } });
    await ctx.makeTask(project.id, { title: 'Obra', startDate: '2026-11-01', dueDate: '2026-11-30', progress: 40 });
  });
  afterEach(() => ctx.close());

  it('emitir congela: un gasto posterior no cambia el informe emitido', async () => {
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Cemento', amountCents: 1000n, date: TODAY, category: 'MATERIALS' } });
    const report = await issue({ comment: '<p>Vamos bien</p>', nextSteps: '<p>Instalar</p>' });
    expect(report).toMatchObject({ number: 1, periodStart: '2026-11-01', periodEnd: TODAY, comment: '<p>Vamos bien</p>', issuedBy: { id: pm.id } });
    expect(report.report.budget.actualCents).toBe(1000);
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Arena', amountCents: 5000n, date: TODAY, category: 'MATERIALS' } });
    const again = (await ctx.as(pm).get(`${url()}/${report.id}`)).json();
    expect(again.report.budget.actualCents).toBe(1000);
    expect(again.report.progress.percent).toBe(40);
  });

  it('el observador lee el informe sin ninguna clave Cents y el colaborador recibe 403', async () => {
    const report = await issue();
    const list = await ctx.as(obs).get(url());
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    const body = (await ctx.as(obs).get(`${url()}/${report.id}`)).json();
    expect(JSON.stringify(body)).not.toMatch(/Cents"/);
    expect(body.report).not.toHaveProperty('budget');
    expect(body.report.progress.percent).toBe(40);
    expect((await ctx.as(ana).get(url())).statusCode).toBe(403);
    expect((await ctx.as(ana).get(`${url()}/${report.id}`)).statusCode).toBe(403);
    expect((await ctx.as(obs).post(url(), {})).statusCode).toBe(403);
  });

  it('el borrador es solo del PM y un observador ajeno recibe 404', async () => {
    const draft = await ctx.as(pm).get(`${url()}/draft`);
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({ periodStart: '2026-11-01', periodEnd: TODAY, report: { budget: { plannedCents: 50000 } } });
    expect((await ctx.as(obs).get(`${url()}/draft`)).statusCode).toBe(403);
    const report = await issue();
    const stranger = await ctx.makeUser({ role: 'OBSERVER' });
    expect((await ctx.as(stranger).get(`${url()}/${report.id}`)).statusCode).toBe(404);
    const other = await ctx.makeProject({ members: [obs] });
    expect((await ctx.as(obs).get(`/api/projects/${other.id}/status-reports/${report.id}`)).statusCode).toBe(404);
  });

  it('números secuenciales y dos informes el mismo día', async () => {
    const first = await issue();
    const second = await issue();
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(second).toMatchObject({ periodStart: TODAY, periodEnd: TODAY });
    const items = (await ctx.as(pm).get(url())).json().items;
    expect(items.map((r: { number: number }) => r.number)).toEqual([2, 1]);
  });

  it('notifica a los observadores miembros y no al colaborador', async () => {
    const report = await issue();
    const notes = await ctx.prisma.notification.findMany({ where: { kind: 'STATUS_REPORT_ISSUED' } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: obs.id, title: 'Informe 1', entityId: report.id });
  });

  it('comentario saneado', async () => {
    const report = await issue({ comment: '<p>Hola</p><script>alert(1)</script>' });
    expect(report.comment).not.toContain('<script>');
    expect(report.comment).toContain('Hola');
  });

  it('toca emitir: con frecuencia semanal y el último informe de hace 7 días', async () => {
    await ctx.as(pm).patch(`/api/projects/${project.id}`, { statusReportFrequency: 'WEEKLY' });
    ctx.clock.set('2026-11-09T10:00:00');
    await issue();
    ctx.clock.set('2026-11-15T10:00:00');
    expect((await ctx.as(pm).get(url())).json().due).toBe(false);
    ctx.clock.set(`${TODAY}T10:00:00`);
    expect((await ctx.as(pm).get(url())).json().due).toBe(true);
    expect((await ctx.as(obs).get(url())).json().due).toBe(false);
  });

  it('un proyecto cerrado no emite informes', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    expect((await ctx.as(pm).post(url(), {})).statusCode).toBe(409);
  });
});
