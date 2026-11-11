import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('contadores del proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('los contadores no se envían', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const list = (await ctx.as(pm).get('/api/projects')).json();
    for (const body of [detail, list[0]]) {
      expect(body).not.toHaveProperty('lastIncidentNumber');
      expect(body).not.toHaveProperty('lastDecisionNumber');
    }
    expect(await ctx.prisma.incident.count()).toBe(0);
    expect(await ctx.prisma.decision.count()).toBe(0);
  });
});

describe('API de incidentes', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let cata: User;
  let project: Project;
  const base = (id = project.id) => `/api/projects/${id}/incidents`;
  const report = async (user: User, body: object = { title: 'Servidor caído' }) => ctx.as(user).post(base(), body);
  const assigned = async () => {
    const created = (await report(beto)).json();
    await ctx.as(pm).patch(`${base()}/${created.id}`, { ownerId: ana.id });
    return created as { id: string; number: number };
  };
  const stored = (id: string) => ctx.prisma.incident.findUniqueOrThrow({ where: { id } });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-10T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    cata = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Cata' });
    project = await ctx.makeProject({ members: [ana, beto, cata] });
  });
  afterEach(() => ctx.close());

  it('qué ve cada rol', async () => {
    const created = await report(beto);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ number: 1, status: 'OPEN', priority: 'MEDIUM', owner: null, reportedBy: { id: beto.id, name: 'Beto' } });
    await ctx.as(pm).patch(`${base()}/${created.json().id}`, { ownerId: ana.id });
    const count = async (user: User) => (await ctx.as(user).get(base())).json().length;
    expect([await count(pm), await count(ana), await count(beto), await count(cata)]).toEqual([1, 1, 1, 0]);
    expect((await ctx.as(cata).get(`${base()}/${created.json().id}`)).statusCode).toBe(404);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(`${base()}/${created.json().id}`)).statusCode).toBe(404);
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
  });

  it('un colaborador que reporta con campos del PM recibe 403', async () => {
    for (const extra of [{ priority: 'HIGH' }, { ownerId: ana.id }, { dueDate: '2026-11-20' }]) {
      expect((await report(beto, { title: 'X', ...extra })).statusCode).toBe(403);
    }
    expect(await ctx.prisma.incident.count()).toBe(0);
  });

  it('el responsable no puede tocar campos del PM ni cerrar', async () => {
    const { id } = await assigned();
    for (const body of [{ ownerId: cata.id }, { priority: 'HIGH' }, { dueDate: '2026-11-20' }, { title: 'Otro' }, { status: 'CLOSED' }]) {
      expect((await ctx.as(ana).patch(`${base()}/${id}`, body)).statusCode).toBe(403);
    }
    expect(await stored(id)).toMatchObject({ ownerId: ana.id, priority: 'MEDIUM', dueDate: null, title: 'Servidor caído', status: 'OPEN' });
  });

  it('quien reportó no cambia el estado', async () => {
    const { id } = await assigned();
    expect((await ctx.as(beto).patch(`${base()}/${id}`, { status: 'IN_PROGRESS' })).statusCode).toBe(403);
  });

  it('el responsable avanza y resuelve', async () => {
    const { id } = await assigned();
    expect((await ctx.as(ana).patch(`${base()}/${id}`, { status: 'IN_PROGRESS' })).statusCode).toBe(200);
    const empty = await ctx.as(ana).patch(`${base()}/${id}`, { status: 'RESOLVED', resolution: '  ' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.fields.resolution).toBeTruthy();
    const ok = await ctx.as(ana).patch(`${base()}/${id}`, { status: 'RESOLVED', resolution: 'Se reinició' });
    expect(ok.statusCode).toBe(200);
    expect(new Date(ok.json().resolvedAt).getTime()).toBe(new Date('2026-11-10T10:00:00').getTime());
  });

  it('el PM cierra y reabre y se vacían las fechas', async () => {
    const { id } = await assigned();
    await ctx.as(ana).patch(`${base()}/${id}`, { status: 'RESOLVED', resolution: 'Listo' });
    const closed = await ctx.as(pm).patch(`${base()}/${id}`, { status: 'CLOSED' });
    expect(closed.json().closedAt).toBeTruthy();
    expect((await ctx.as(ana).patch(`${base()}/${id}`, { status: 'IN_PROGRESS' })).statusCode).toBe(403);
    const reopened = await ctx.as(pm).patch(`${base()}/${id}`, { status: 'OPEN' });
    expect(reopened.json()).toMatchObject({ status: 'OPEN', closedAt: null, resolvedAt: null });
    expect((await ctx.as(ana).patch(`${base()}/${id}`, { status: 'IN_PROGRESS' })).statusCode).toBe(200);
  });

  it('la numeración no reutiliza números y solo el PM borra', async () => {
    await report(beto);
    await report(beto);
    const third = (await report(beto)).json();
    expect((await ctx.as(beto).delete(`${base()}/${third.id}`)).statusCode).toBe(403);
    expect((await ctx.as(pm).delete(`${base()}/${third.id}`)).statusCode).toBe(200);
    expect((await report(beto)).json().number).toBe(4);
  });

  it('validaciones de responsable, tarea y riesgo de otro proyecto', async () => {
    const other = await ctx.makeProject();
    const foreignTask = await ctx.makeTask(other.id);
    const foreignRisk = await ctx.prisma.risk.create({ data: { projectId: other.id, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT' } });
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    for (const [field, value] of [['ownerId', outsider.id], ['taskId', foreignTask.id], ['riskId', foreignRisk.id]] as const) {
      const res = await ctx.as(pm).post(base(), { title: 'X', [field]: value });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields[field]).toBeTruthy();
    }
    const own = (await report(beto)).json();
    expect((await ctx.as(pm).patch(`${base()}/${own.id}`, { taskId: foreignTask.id })).statusCode).toBe(400);
    expect((await report(beto, { title: 'X', taskId: foreignTask.id })).statusCode).toBe(400);
  });

  it('filtros por estado y míos', async () => {
    const mine = (await ctx.as(pm).post(base(), { title: 'Mío' })).json();
    const { id } = await assigned();
    await ctx.as(ana).patch(`${base()}/${id}`, { status: 'IN_PROGRESS' });
    const titles = async (query: string) => (await ctx.as(pm).get(`${base()}${query}`)).json().map((i: { title: string }) => i.title);
    expect(await titles('?status=OPEN')).toEqual(['Mío']);
    expect(await titles('?status=IN_PROGRESS')).toEqual(['Servidor caído']);
    expect(await titles('?mine=1')).toEqual(['Mío']);
    expect(mine.number).toBe(1);
  });

  it('overdue y can', async () => {
    const { id } = await assigned();
    await ctx.as(pm).patch(`${base()}/${id}`, { dueDate: '2026-11-09' });
    const asAna = (await ctx.as(ana).get(`${base()}/${id}`)).json();
    expect(asAna.overdue).toBe(true);
    expect(asAna.can).toEqual({ edit: false, changeStatus: true, close: false });
    expect((await ctx.as(pm).get(`${base()}/${id}`)).json().can).toEqual({ edit: true, changeStatus: true, close: true });
  });

  it('el riesgo enlazado solo se ve como PM', async () => {
    const risk = await ctx.prisma.risk.create({ data: { projectId: project.id, description: '<p><strong>Caída</strong></p>', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT' } });
    const { id } = await assigned();
    await ctx.as(pm).patch(`${base()}/${id}`, { riskId: risk.id });
    expect((await ctx.as(pm).get(`${base()}/${id}`)).json().risk).toEqual({ id: risk.id, title: 'Caída' });
    expect((await ctx.as(ana).get(`${base()}/${id}`)).json().risk).toBeNull();
  });

  it('quien reportó desactivado sigue apareciendo', async () => {
    const { id } = await assigned();
    await ctx.prisma.user.update({ where: { id: beto.id }, data: { active: false } });
    const res = await ctx.as(pm).get(base());
    expect(res.statusCode).toBe(200);
    expect(res.json().find((i: { id: string }) => i.id === id).reportedBy.name).toBe('Beto');
  });

  it('quitar a un miembro lo saca como responsable y el aviso lo cuenta', async () => {
    const { id } = await assigned();
    expect((await ctx.as(pm).get(`/api/projects/${project.id}/members/${ana.id}/impact`)).json().incidents).toBe(1);
    await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`);
    expect((await ctx.as(pm).get(`${base()}/${id}`)).json().owner).toBeNull();
  });

  it('borrar la tarea o el riesgo deja el enlace vacío', async () => {
    const task = await ctx.makeTask(project.id, { title: 'T' });
    const risk = await ctx.prisma.risk.create({ data: { projectId: project.id, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT' } });
    const created = (await ctx.as(pm).post(base(), { title: 'X', taskId: task.id, riskId: risk.id })).json();
    expect(created.task).toEqual({ id: task.id, title: 'T' });
    await ctx.as(pm).delete(`/api/tasks/${task.id}`);
    await ctx.as(pm).delete(`/api/projects/${project.id}/risks/${risk.id}`);
    expect(await stored(created.id)).toMatchObject({ taskId: null, riskId: null });
  });

  it('el detalle de tarea lista los incidentes visibles', async () => {
    const task = await ctx.makeTask(project.id, { title: 'T', assignees: [beto, cata] });
    await report(beto, { title: 'En la tarea', taskId: task.id });
    expect((await ctx.as(beto).get(`/api/tasks/${task.id}`)).json().incidents).toEqual([expect.objectContaining({ number: 1, title: 'En la tarea', status: 'OPEN' })]);
    expect((await ctx.as(cata).get(`/api/tasks/${task.id}`)).json().incidents).toEqual([]);
  });
});
