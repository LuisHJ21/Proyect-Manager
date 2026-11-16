import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveEvmSnapshot } from '../src/routes/performance';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('líneas base y desempeño', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let design: Task;
  let build: Task;
  const perf = (id = project.id) => `/api/projects/${id}/performance`;
  const baselines = (id = project.id) => `/api/projects/${id}/baselines`;
  const costed = async (title: string, cost: number, startDate: string | undefined, dueDate: string) => {
    const task = await ctx.makeTask(project.id, { title, startDate, dueDate });
    return ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: cost } });
  };
  const approvedChange = async (projectId = project.id) => {
    const cr = (await ctx.as(pm).post(`/api/projects/${projectId}/change-requests`, { title: 'Agregar blog' })).json();
    await ctx.as(pm).post(`/api/projects/${projectId}/change-requests/${cr.id}/decision`, { status: 'APPROVED', note: 'Ok' });
    return cr;
  };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-05T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana], plannedBudgetCents: 500000 });
    design = await costed('Diseño', 100000, '2026-11-01', '2026-11-10');
    build = await costed('Construcción', 300000, '2026-11-11', '2026-11-30');
  });
  afterEach(() => ctx.close());

  it('colaborador 403 y no miembro 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(ana).get(perf())).statusCode).toBe(403);
    expect((await ctx.as(ana).post(baselines(), {})).statusCode).toBe(403);
    expect((await ctx.as(outsider).get(perf())).statusCode).toBe(404);
    expect((await ctx.as(outsider).post(baselines(), {})).statusCode).toBe(404);
  });

  it('sin línea base devuelve vacío', async () => {
    const body = (await ctx.as(pm).get(perf())).json();
    expect(body).toEqual({ baseline: null, history: [], metrics: null, tasks: [], outsideBaseline: 0, outsideBaselineCostCents: 0, series: [] });
    expect(await ctx.prisma.evmSnapshot.count()).toBe(0);
  });

  it('ninguna tarea con costo responde baseline_empty', async () => {
    await ctx.prisma.task.updateMany({ data: { plannedCostCents: 0 } });
    const res = await ctx.as(pm).post(baselines(), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('baseline_empty');
  });

  it('tareas con costo sin fechas responden baseline_missing_dates con la lista', async () => {
    await ctx.prisma.task.update({ where: { id: design.id }, data: { startDate: null } });
    const res = await ctx.as(pm).post(baselines(), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('baseline_missing_dates');
    expect(res.json().error.details.tasks).toEqual([{ id: design.id, title: 'Diseño' }]);
  });

  it('versión 1 sin motivo, versión 2 exige motivo', async () => {
    const first = await ctx.as(pm).post(baselines(), {});
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ version: 1, reason: '', bacCents: 400000 });
    const noReason = await ctx.as(pm).post(baselines(), { reason: '  ' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error.fields.reason).toBeTruthy();
    expect((await ctx.as(pm).post(baselines(), { reason: 'Replan' })).json().version).toBe(2);
    const body = (await ctx.as(pm).get(perf())).json();
    expect(body.history.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    expect(body.baseline).toMatchObject({ version: 2, reason: 'Replan', createdBy: { id: pm.id, name: 'Paula' }, changeRequest: null });
  });

  it('cambio ligado debe estar aprobado y ser del proyecto', async () => {
    const pending = (await ctx.as(pm).post(`/api/projects/${project.id}/change-requests`, { title: 'Pendiente' })).json();
    const res = await ctx.as(pm).post(baselines(), { changeRequestId: pending.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.changeRequestId).toBeTruthy();
    const other = await ctx.makeProject();
    const foreign = await approvedChange(other.id);
    expect((await ctx.as(pm).post(baselines(), { changeRequestId: foreign.id })).statusCode).toBe(400);
    const own = await approvedChange();
    expect((await ctx.as(pm).post(baselines(), { changeRequestId: own.id })).statusCode).toBe(201);
    expect((await ctx.as(pm).get(perf())).json().baseline.changeRequest).toEqual({ id: own.id, number: own.number, title: 'Agregar blog' });
  });

  it('la base no cambia al editar o borrar tareas', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.prisma.task.update({ where: { id: design.id }, data: { dueDate: '2026-11-13', plannedCostCents: 1 } });
    await ctx.prisma.task.delete({ where: { id: build.id } });
    await costed('Blog', 50000, '2026-11-12', '2026-11-20');
    const body = (await ctx.as(pm).get(perf())).json();
    expect(body.baseline.bacCents).toBe(400000);
    expect(body.outsideBaseline).toBe(1);
    const byTitle = Object.fromEntries(body.tasks.map((t: { title: string }) => [t.title, t]));
    expect(byTitle['Diseño']).toMatchObject({ state: 'LATE', finishVarianceDays: 3, baselineCostCents: 100000 });
    expect(byTitle['Construcción']).toMatchObject({ state: 'DELETED' });
    expect(byTitle['Blog']).toMatchObject({ state: 'OUTSIDE' });
  });

  it('calcula las métricas con avance y gastos', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.prisma.task.update({ where: { id: design.id }, data: { progress: 40 } });
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 50000, date: '2026-11-04', category: 'OTHER', taskId: design.id } });
    const { metrics } = (await ctx.as(pm).get(perf())).json();
    expect(metrics).toMatchObject({ pvCents: 50000, evCents: 40000, acCents: 50000, bacCents: 400000, cpi: 0.8, spi: 0.8, unallocatedCents: 100000, contingencyCents: 0 });
  });

  it('leer el desempeño no guarda fotos', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.as(pm).get(perf());
    expect(await ctx.prisma.evmSnapshot.count()).toBe(0);
  });

  it('series usa las fotos de la tarea diaria y calcula hoy al momento', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 7000, date: '2026-11-05', category: 'OTHER' } });
    await saveEvmSnapshot(ctx.prisma, project.id, '2026-11-05');
    ctx.clock.set('2026-11-06T10:00:00');
    await ctx.prisma.task.update({ where: { id: design.id }, data: { progress: 40 } });
    const { series } = (await ctx.as(pm).get(perf())).json();
    expect(series[0]).toMatchObject({ date: '2026-11-01', evCents: null, acCents: null });
    expect(series.at(-1).date).toBe('2026-11-30');
    expect(series).toHaveLength(30);
    const day = (date: string) => series.find((p: { date: string }) => p.date === date);
    expect(day('2026-11-05')).toMatchObject({ pvCents: 50000, evCents: 0, acCents: 7000 });
    expect(day('2026-11-06')).toMatchObject({ evCents: 40000, acCents: 7000 });
    expect(await ctx.prisma.evmSnapshot.count()).toBe(1);
  });

  it('informa el gasto que no está ligado a tareas de la línea base', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Sin tarea', amountCents: 2500, date: '2026-11-03', category: 'OTHER' } });
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'Diseño', amountCents: 1000, date: '2026-11-03', category: 'OTHER', taskId: design.id } });
    const body = (await ctx.as(pm).get(perf())).json();
    expect(body.outsideBaselineCostCents).toBe(2500);
    expect(body.metrics.acCents).toBe(3500);
  });

  it('series incluye hoy aunque caiga fuera de la base', async () => {
    await ctx.as(pm).post(baselines(), {});
    ctx.clock.set('2026-12-05T10:00:00');
    const { series } = (await ctx.as(pm).get(perf())).json();
    expect(series.at(-1)).toMatchObject({ date: '2026-12-05', pvCents: 400000 });
  });

  it('base con todas sus tareas borradas responde 200 con EV 0', async () => {
    await ctx.as(pm).post(baselines(), {});
    await ctx.prisma.task.deleteMany({ where: { projectId: project.id } });
    const res = await ctx.as(pm).get(perf());
    expect(res.statusCode).toBe(200);
    expect(res.json().metrics).toMatchObject({ evCents: 0, cpi: null, eacCents: 400000 });
  });
});

describe('salud con valor ganado', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('la lista de proyectos y el panel usan CPI', async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-05T10:00:00');
    const pm = await ctx.makeUser({ role: 'PM' });
    const project = await ctx.makeProject({ name: 'Portal', plannedBudgetCents: 10_000_000 });
    const task = await ctx.makeTask(project.id, { title: 'Diseño', startDate: '2026-11-01', dueDate: '2026-11-10', progress: 50 });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 100000 } });
    const before = (await ctx.as(pm).get('/api/projects')).json();
    expect(before[0].health).toBe('ON_TRACK');
    await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    // EV 50 000 y AC 100 000: CPI 0,5. SPI = 50 000 / 50 000 = 1.
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 100000, date: '2026-11-04', category: 'OTHER' } });
    const list = (await ctx.as(pm).get('/api/projects')).json();
    expect(list[0].health).toBe('ATTENTION');
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(dashboard.projects.find((p: { name: string }) => p.name === 'Portal').health).toBe('ATTENTION');
  });
});

describe('límites de la curva S', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('un año mal escrito no genera cientos de miles de días', async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-05T10:00:00');
    const pm = await ctx.makeUser({ role: 'PM' });
    const project = await ctx.makeProject();
    const task = await ctx.makeTask(project.id, { title: 'Typo', startDate: '0126-11-01', dueDate: '2026-11-10' });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 100000 } });
    await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    const started = Date.now();
    const { series } = (await ctx.as(pm).get(`/api/projects/${project.id}/performance`)).json();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(series.length).toBeLessThanOrEqual(732);
    expect(series[0].date).toBe('0126-11-01');
    expect(series.at(-1).date).toBe('2026-11-10');
    expect(series.some((p: { date: string }) => p.date === '2026-11-05')).toBe(true);
  });
});

describe('datos de control y colaboradores', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('el colaborador no recibe el contador de cambios del proyecto', async () => {
    ctx = await createTestApp();
    const pm = await ctx.makeUser({ role: 'PM' });
    const ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    const project = await ctx.makeProject({ members: [ana] });
    await ctx.as(pm).post(`/api/projects/${project.id}/change-requests`, { title: 'X' });
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const list = (await ctx.as(ana).get('/api/projects')).json();
    expect(detail).not.toHaveProperty('lastChangeNumber');
    expect(list[0]).not.toHaveProperty('lastChangeNumber');
    expect((await ctx.as(pm).get(`/api/projects/${project.id}`)).json()).not.toHaveProperty('lastChangeNumber');
  });
});
