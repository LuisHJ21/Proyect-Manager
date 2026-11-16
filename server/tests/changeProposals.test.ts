import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const PROPOSAL_KEYS = ['createdAt', 'decidedAt', 'decidedBy', 'decisionNote', 'description', 'id', 'number', 'status', 'title'];
const HIDDEN = ['scopeImpact', 'scheduleImpactDays', 'costImpactCents', 'requestedBy', 'requestedById', 'updatedAt', 'proposedBy', 'appliedAt', 'appliedById', 'appliedBy'];

describe('propuestas de cambio del equipo', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const base = () => `/api/projects/${project.id}/change-requests`;
  const propose = async (user: User, title = 'Agregar blog') => (await ctx.as(user).post(base(), { title, description: 'Hace falta' })).json();

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana, luis] });
  });
  afterEach(() => ctx.close());

  it('el colaborador propone y queda como solicitante', async () => {
    const res = await ctx.as(ana).post(base(), { title: 'Agregar blog', description: 'Hace falta' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(PROPOSAL_KEYS);
    expect(body).toMatchObject({ title: 'Agregar blog', description: 'Hace falta', status: 'PENDING', number: 1 });
    const row = await ctx.prisma.changeRequest.findUniqueOrThrow({ where: { id: body.id } });
    expect(row).toMatchObject({ requestedById: ana.id, requestedBy: 'Ana' });
  });

  it('el colaborador solo ve sus propuestas', async () => {
    const own = (await ctx.as(pm).post(base(), { title: 'Del PM' })).json();
    const mine = await propose(ana);
    await propose(luis, 'De Luis');
    const list = (await ctx.as(ana).get(base())).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([mine.id]);
    const all = (await ctx.as(pm).get(base())).json();
    expect(all).toHaveLength(3);
    expect(all.find((c: { id: string }) => c.id === mine.id).proposedBy).toEqual({ id: ana.id, name: 'Ana' });
    expect(all.find((c: { id: string }) => c.id === own.id).proposedBy).toBeNull();
  });

  it('la lista del colaborador no trae impactos', async () => {
    const mine = await propose(ana);
    const patched = await ctx.as(pm).patch(`${base()}/${mine.id}`, { scopeImpact: 'Nueva sección', scheduleImpactDays: 3, costImpactCents: 5000 });
    expect(patched.statusCode).toBe(200);
    const [item] = (await ctx.as(ana).get(base())).json();
    for (const key of HIDDEN) expect(item).not.toHaveProperty(key);
  });

  it('el colaborador ve la decisión', async () => {
    const mine = await propose(ana);
    await ctx.as(pm).post(`${base()}/${mine.id}/decision`, { status: 'REJECTED', note: 'Fuera de alcance' });
    const [item] = (await ctx.as(ana).get(base())).json();
    expect(item).toMatchObject({ status: 'REJECTED', decisionNote: 'Fuera de alcance', decidedBy: { id: pm.id, name: 'Paula' } });
  });

  it('el colaborador ve su propuesta aplicada, sin los datos de la aplicación', async () => {
    const mine = await propose(ana);
    await ctx.as(pm).post(`${base()}/${mine.id}/decision`, { status: 'APPROVED', note: 'Ok' });
    expect((await ctx.as(pm).post(`${base()}/${mine.id}/apply`, { baseline: false })).statusCode).toBe(200);
    const [item] = (await ctx.as(ana).get(base())).json();
    expect(item.status).toBe('APPLIED');
    for (const key of HIDDEN) expect(item).not.toHaveProperty(key);
  });

  it('otras claves dan 403 aunque vengan vacías', async () => {
    for (const extra of [{ costImpactCents: null }, { requestedBy: '' }, { scopeImpact: 'a' }]) {
      const res = await ctx.as(ana).post(base(), { title: 'X', ...extra });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.message).toBe('Solo el Project Manager puede fijar impactos o solicitante');
    }
    expect(await ctx.prisma.changeRequest.count()).toBe(0);
  });

  it('el colaborador no edita, no borra ni decide', async () => {
    const mine = await propose(ana);
    expect((await ctx.as(ana).patch(`${base()}/${mine.id}`, { title: 'Otro' })).statusCode).toBe(403);
    expect((await ctx.as(ana).delete(`${base()}/${mine.id}`)).statusCode).toBe(403);
    expect((await ctx.as(ana).post(`${base()}/${mine.id}/decision`, { status: 'APPROVED', note: 'Ok' })).statusCode).toBe(403);
  });

  it('el PM no borra una propuesta del equipo', async () => {
    const mine = await propose(ana);
    const res = await ctx.as(pm).delete(`${base()}/${mine.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'change_proposed', message: 'Una propuesta del equipo no se borra: recházala con una nota' });
    expect(await ctx.prisma.changeRequest.count()).toBe(1);
    const own = (await ctx.as(pm).post(base(), { title: 'Del PM' })).json();
    expect((await ctx.as(pm).delete(`${base()}/${own.id}`)).statusCode).toBe(200);
  });

  it('en un proyecto cerrado no se propone', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const res = await ctx.as(ana).post(base(), { title: 'X' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('project_closed');
  });

  it('el observador sigue sin acceso', async () => {
    const olga = await ctx.makeUser({ role: 'OBSERVER' });
    await ctx.prisma.projectMember.create({ data: { projectId: project.id, userId: olga.id } });
    expect((await ctx.as(olga).get(base())).statusCode).toBe(403);
    expect((await ctx.as(olga).post(base(), { title: 'X' })).statusCode).toBe(403);
  });
});
