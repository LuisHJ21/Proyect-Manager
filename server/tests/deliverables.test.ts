import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('contador de entregables', () => {
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

  it('el contador no se envía', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const list = (await ctx.as(pm).get('/api/projects')).json();
    for (const body of [detail, list[0]]) expect(body).not.toHaveProperty('lastDeliverableNumber');
    expect(await ctx.prisma.deliverable.count()).toBe(0);
  });
});

describe('API de entregables', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const base = () => `/api/projects/${project.id}/deliverables`;
  const create = async (body: object = { name: 'Portal web' }) => (await ctx.as(pm).post(base(), body)).json();
  const detail = async (id: string) => (await ctx.as(pm).get(`${base()}/${id}`)).json();
  const force = (id: string, status: string) => ctx.prisma.deliverable.update({ where: { id }, data: { status } });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-11T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('solo el PM escribe; el colaborador lee (C1)', async () => {
    const { id } = await create();
    expect((await ctx.as(ana).get(base())).statusCode).toBe(200);
    expect((await ctx.as(ana).post(base(), { name: 'X' })).statusCode).toBe(403);
    expect((await ctx.as(ana).get(`${base()}/${id}`)).statusCode).toBe(200);
    expect((await ctx.as(ana).post(`${base()}/${id}/criteria`, { text: 'X' })).statusCode).toBe(403);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
  });

  it('crear con criterios', async () => {
    const res = await ctx.as(pm).post(base(), { name: 'Portal web', description: '<p>x</p><script>1</script>', criteria: ['Funciona en móvil', '  ', 'Manual'] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ number: 1, status: 'PENDING', criteriaTotal: 2, criteriaMet: 0, overdue: false, milestone: null, lastReview: null });
    const full = await detail(res.json().id);
    expect(full.criteria.map((c: { text: string }) => c.text)).toEqual(['Funciona en móvil', 'Manual']);
    expect(full.description).toBe('<p>x</p>');
    expect(full.reviews).toEqual([]);
  });

  it('los criterios iniciales respetan el límite de 300 caracteres', async () => {
    const res = await ctx.as(pm).post(base(), { name: 'X', criteria: ['ok', 'x'.repeat(301)] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields['criteria.1']).toBe('Máximo 300 caracteres');
    expect(await ctx.prisma.deliverable.count()).toBe(0);
  });

  it('numeración', async () => {
    await create();
    await create();
    const third = await create();
    expect((await ctx.as(pm).delete(`${base()}/${third.id}`)).statusCode).toBe(200);
    expect((await create()).number).toBe(4);
  });

  it('hito de otro proyecto', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.prisma.milestone.create({ data: { projectId: other.id, name: 'Ajeno', dueDate: '2026-12-01' } });
    const res = await ctx.as(pm).post(base(), { name: 'X', milestoneId: foreign.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.milestoneId).toBeTruthy();
    const { id } = await create();
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { milestoneId: foreign.id })).json().error.fields.milestoneId).toBeTruthy();
  });

  it('transiciones', async () => {
    const { id } = await create();
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { status: 'IN_REVIEW' })).json().status).toBe('IN_REVIEW');
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { status: 'PENDING' })).json().status).toBe('PENDING');
    const direct = await ctx.as(pm).patch(`${base()}/${id}`, { status: 'ACCEPTED' });
    expect(direct.statusCode).toBe(400);
    expect(direct.json().error.fields.status).toBeTruthy();
    await force(id, 'ACCEPTED');
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { status: 'IN_REVIEW' })).statusCode).toBe(409);
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { status: 'PENDING' })).statusCode).toBe(200);
  });

  it('vencido y filtro', async () => {
    const late = await create({ name: 'Tarde', dueDate: '2026-11-10' });
    expect(late.overdue).toBe(true);
    const other = await create({ name: 'Otro' });
    await ctx.as(pm).patch(`${base()}/${other.id}`, { status: 'IN_REVIEW' });
    const names = async (q: string) => (await ctx.as(pm).get(`${base()}${q}`)).json().map((d: { name: string }) => d.name);
    expect(await names('')).toEqual(['Tarde', 'Otro']);
    expect(await names('?status=IN_REVIEW')).toEqual(['Otro']);
    expect((await ctx.as(pm).get(`${base()}?status=NOPE`)).statusCode).toBe(400);
    expect((await ctx.as(pm).get(`${base()}?status=PENDING&status=IN_REVIEW`)).statusCode).toBe(400);
  });

  it('criterios', async () => {
    const { id } = await create({ name: 'X', criteria: ['A'] });
    const added = (await ctx.as(pm).post(`${base()}/${id}/criteria`, { text: 'B' })).json();
    expect(added.criteria.map((c: { text: string }) => c.text)).toEqual(['A', 'B']);
    const [a, b] = added.criteria;
    const marked = (await ctx.as(pm).patch(`${base()}/${id}/criteria/${a.id}`, { met: true })).json();
    expect(marked.criteriaMet).toBe(1);
    const removed = (await ctx.as(pm).delete(`${base()}/${id}/criteria/${b.id}`)).json();
    expect(removed.criteria.map((c: { text: string }) => c.text)).toEqual(['A']);
    const other = await create({ name: 'Y', criteria: ['Z'] });
    const foreign = (await detail(other.id)).criteria[0];
    expect((await ctx.as(pm).patch(`${base()}/${id}/criteria/${foreign.id}`, { met: true })).statusCode).toBe(404);
    expect((await ctx.as(pm).post(`${base()}/${id}/criteria`, { text: ' ' })).statusCode).toBe(400);
  });

  it('reordenar', async () => {
    const { id } = await create({ name: 'X', criteria: ['A', 'B', 'C'] });
    const ids = (await detail(id)).criteria.map((c: { id: string }) => c.id);
    const res = await ctx.as(pm).put(`${base()}/${id}/criteria/order`, { ids: [...ids].reverse() });
    expect(res.json().criteria.map((c: { text: string }) => c.text)).toEqual(['C', 'B', 'A']);
    const other = await create({ name: 'Y', criteria: ['Z'] });
    const foreign = (await detail(other.id)).criteria[0].id;
    for (const bad of [[ids[0], ids[0], ids[1]], [ids[0], ids[1], foreign], [ids[0], ids[1]]]) {
      expect((await ctx.as(pm).put(`${base()}/${id}/criteria/order`, { ids: bad })).statusCode).toBe(400);
    }
    expect((await detail(id)).criteria.map((c: { text: string }) => c.text)).toEqual(['C', 'B', 'A']);
  });

  it('criterios bloqueados si está aceptado', async () => {
    const { id } = await create({ name: 'X', criteria: ['A'] });
    const cid = (await detail(id)).criteria[0].id;
    await force(id, 'ACCEPTED');
    expect((await ctx.as(pm).post(`${base()}/${id}/criteria`, { text: 'B' })).statusCode).toBe(409);
    expect((await ctx.as(pm).patch(`${base()}/${id}/criteria/${cid}`, { met: true })).statusCode).toBe(409);
    expect((await ctx.as(pm).delete(`${base()}/${id}/criteria/${cid}`)).statusCode).toBe(409);
    expect((await ctx.as(pm).put(`${base()}/${id}/criteria/order`, { ids: [cid] })).statusCode).toBe(409);
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { name: 'Nuevo' })).statusCode).toBe(200);
  });

  it('borrar el hito deja el enlace vacío', async () => {
    const milestone = await ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Lanzamiento', dueDate: '2026-12-01' } });
    const created = await create({ name: 'X', milestoneId: milestone.id });
    expect(created.milestone).toEqual({ id: milestone.id, name: 'Lanzamiento' });
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/milestones/${milestone.id}`)).statusCode).toBe(200);
    expect((await detail(created.id)).milestone).toBeNull();
  });
});
