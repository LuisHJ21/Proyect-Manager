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
    expect(body.workload).toEqual([expect.objectContaining({ userId: c.id, name: 'Carlos Vega', openTasks: 1, overdueTasks: 1 })]);
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

describe('GET /api/dashboard: carga semanal', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('compara horas asignadas con la capacidad sumada entre proyectos', async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-16T10:00:00');
    const pm = await ctx.makeUser({ role: 'PM' });
    const ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    const a = await ctx.makeProject({ name: 'A', members: [ana] });
    const b = await ctx.makeProject({ name: 'B', members: [ana] });
    await ctx.prisma.projectMember.update({ where: { projectId_userId: { projectId: b.id, userId: ana.id } }, data: { weeklyCapacityHours: 10 } });
    const t = await ctx.makeTask(a.id, { title: 'Obra', startDate: '2026-11-16', dueDate: '2026-11-22', assignees: [ana] });
    await ctx.prisma.task.update({ where: { id: t.id }, data: { estimatedHours: 60 } });
    const { workload } = (await ctx.as(pm).get('/api/dashboard')).json();
    const entry = workload.find((w: { userId: string }) => w.userId === ana.id);
    expect(entry.weeks).toHaveLength(4);
    expect(entry.weeks[0]).toEqual({ start: '2026-11-16', assignedHours: 60, capacityHours: 50, overloaded: true });
    expect(entry.weeks[1]).toEqual({ start: '2026-11-23', assignedHours: 0, capacityHours: 50, overloaded: false });
  });
});

describe('GET /api/dashboard con incidentes', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('devuelve los incidentes urgentes con número y proyecto', async () => {
    ctx = await createTestApp();
    const pm = await ctx.makeUser({ role: 'PM' });
    const p = await ctx.makeProject({ name: 'Portal' });
    await ctx.as(pm).post(`/api/projects/${p.id}/incidents`, { title: 'Caída', priority: 'HIGH' });
    const body = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(body.attention).toEqual([expect.objectContaining({ kind: 'incident', number: 1, title: 'Caída', projectName: 'Portal', priority: 'HIGH', overdue: false })]);
  });
});

describe('GET /api/dashboard con entregables', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('devuelve los entregables vencidos con número y proyecto', async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-11T10:00:00');
    const pm = await ctx.makeUser({ role: 'PM' });
    const p = await ctx.makeProject({ name: 'Portal' });
    await ctx.as(pm).post(`/api/projects/${p.id}/deliverables`, { name: 'Manual', dueDate: '2026-11-05' });
    const body = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(body.attention).toEqual([expect.objectContaining({ kind: 'deliverable', number: 1, title: 'Manual', projectName: 'Portal', dueDate: '2026-11-05' })]);
  });

  it('lista los cambios aprobados sin aplicar de proyectos activos', async () => {
    ctx = await createTestApp();
    const pm = await ctx.makeUser({ role: 'PM' });
    const p = await ctx.makeProject({ name: 'Portal' });
    const closed = await ctx.makeProject({ name: 'Viejo' });
    const make = (projectId: string, number: number, status: string) =>
      ctx.prisma.changeRequest.create({ data: { projectId, number, title: `Cambio ${number}`, status } });
    const approved = await make(p.id, 1, 'APPROVED');
    await make(p.id, 2, 'APPLIED');
    await make(p.id, 3, 'PENDING');
    await make(closed.id, 1, 'APPROVED');
    await ctx.prisma.project.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
    const changes = (await ctx.as(pm).get('/api/dashboard')).json().attention.filter((a: { kind: string }) => a.kind === 'change');
    expect(changes).toEqual([{ kind: 'change', id: approved.id, number: 1, title: 'Cambio 1', projectId: p.id, projectName: 'Portal' }]);
  });

  it('avisa que toca emitir el informe de estado', async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-16T10:00:00');
    const pm = await ctx.makeUser({ role: 'PM' });
    const weekly = await ctx.makeProject({ name: 'Portal' });
    const none = await ctx.makeProject({ name: 'Sin frecuencia' });
    const recent = await ctx.makeProject({ name: 'Al día' });
    for (const p of [weekly, recent]) await ctx.prisma.project.update({ where: { id: p.id }, data: { statusReportFrequency: 'WEEKLY', startDate: '2026-11-08' } });
    await ctx.prisma.project.update({ where: { id: none.id }, data: { startDate: '2026-11-08' } });
    await ctx.prisma.statusReport.create({ data: { projectId: recent.id, number: 1, periodStart: '2026-11-08', periodEnd: '2026-11-12', report: '{}', issuedById: pm.id } });
    const reports = (await ctx.as(pm).get('/api/dashboard')).json().attention.filter((a: { kind: string }) => a.kind === 'report');
    expect(reports).toEqual([{ kind: 'report', id: weekly.id, title: 'Toca emitir el informe de estado', projectId: weekly.id, projectName: 'Portal' }]);
  });
});
