import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('lecciones aprendidas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let project: Project;
  const base = (id = project.id) => `/api/projects/${id}/lessons`;
  const lesson = { type: 'TO_IMPROVE', category: 'COST', situation: 'Se subestimó', recommendation: 'Reservar 10 %' };

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    project = await ctx.makeProject({ name: 'Portal', members: [ana, beto] });
  });
  afterEach(() => ctx.close());

  it('un miembro crea y lista', async () => {
    const res = await ctx.as(ana).post(base(), lesson);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ ...lesson, author: { id: ana.id, name: 'Ana' }, project: { id: project.id, name: 'Portal' }, canEdit: true });
    expect((await ctx.as(beto).get(base())).json()).toEqual([expect.objectContaining({ situation: 'Se subestimó', canEdit: false })]);
  });

  it('permisos', async () => {
    const { id } = (await ctx.as(ana).post(base(), lesson)).json();
    expect((await ctx.as(beto).patch(`${base()}/${id}`, { situation: 'Otra' })).statusCode).toBe(403);
    expect((await ctx.as(beto).delete(`${base()}/${id}`)).statusCode).toBe(403);
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { situation: 'Editada' })).json().situation).toBe('Editada');
    expect((await ctx.as(ana).patch(`${base()}/${id}`, { recommendation: 'Nueva' })).statusCode).toBe(200);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
    expect((await ctx.as(ana).delete(`${base()}/${id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.lesson.count()).toBe(0);
  });

  it('con el proyecto cerrado se puede añadir', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    expect((await ctx.as(ana).post(base(), lesson)).statusCode).toBe(201);
  });

  it('vista global', async () => {
    const carlos = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos' });
    const other = await ctx.makeProject({ name: 'Intranet', members: [carlos] });
    await ctx.as(ana).post(base(), lesson);
    await ctx.as(carlos).post(base(other.id), { type: 'WORKED_WELL', category: 'TEAM', situation: 'Reuniones cortas al 50% del tiempo' });
    const get = (q = '') => ctx.as(carlos).get(`/api/lessons${q}`);
    const all = (await get()).json();
    expect(all.map((l: { project: { name: string } }) => l.project.name).sort()).toEqual(['Intranet', 'Portal']);
    expect(Object.keys(all[0].project).sort()).toEqual(['id', 'name']);
    expect((await get('?category=COST')).json().map((l: { situation: string }) => l.situation)).toEqual(['Se subestimó']);
    expect((await get('?q=subestim')).json()).toHaveLength(1);
    expect((await get('?type=WORKED_WELL')).json()).toHaveLength(1);
    expect((await get(`?projectId=${other.id}`)).json()).toHaveLength(1);
    const percent = await get('?q=50%25');
    expect(percent.statusCode).toBe(200);
    expect(percent.json().map((l: { situation: string }) => l.situation)).toEqual(['Reuniones cortas al 50% del tiempo']);
    expect((await get('?q=_')).json()).toHaveLength(0);
    expect((await get('?type=X')).statusCode).toBe(400);
    expect((await get('?category=COST&category=TEAM')).statusCode).toBe(400);
  });

  it('un proyecto que no comparte sus lecciones solo las muestra a su equipo y al PM', async () => {
    const carlos = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos' });
    await ctx.makeProject({ name: 'Intranet', members: [carlos] });
    await ctx.as(ana).post(base(), lesson);
    const names = async (user: User) => ((await ctx.as(user).get('/api/lessons')).json() as { project: { name: string } }[]).map((l) => l.project.name);
    expect(await names(carlos)).toEqual(['Portal']);
    await ctx.prisma.project.update({ where: { id: project.id }, data: { shareLessons: false } });
    expect(await names(carlos)).toEqual([]);
    expect(await names(beto)).toEqual(['Portal']);
    expect(await names(pm)).toEqual(['Portal']);
    expect((await ctx.as(pm).get(`/api/projects/${project.id}`)).json().shareLessons).toBe(false);
  });

  it('anónimo', async () => {
    expect((await ctx.anon.get('/api/lessons')).statusCode).toBe(401);
  });
});
