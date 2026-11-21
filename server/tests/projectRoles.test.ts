import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('roles del proyecto', () => {
  let ctx: TestCtx;
  beforeEach(async () => { ctx = await createTestApp(); });
  afterEach(() => ctx.close());

  it('el PM crea, renombra y borra opciones; el colaborador solo las lee', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    const project = await ctx.makeProject({ members: [ana] });
    const url = `/api/projects/${project.id}/roles`;
    expect((await ctx.as(ana).post(url, { name: 'Diseño' })).statusCode).toBe(403);
    const created = await ctx.as(pm).post(url, { name: 'Diseño' });
    expect(created.statusCode).toBe(201);
    expect((await ctx.as(ana).get(url)).json()).toEqual([{ id: created.json().id, name: 'Diseño' }]);
    expect((await ctx.as(pm).patch(`/api/projects/${project.id}/members/${ana.id}`, { projectRole: 'Diseño' })).statusCode).toBe(200);
    expect((await ctx.as(pm).delete(`${url}/${created.json().id}`)).statusCode).toBe(409);
    expect((await ctx.as(pm).patch(`${url}/${created.json().id}`, { name: 'Diseño UX' })).statusCode).toBe(200);
    expect((await ctx.as(pm).get(`/api/projects/${project.id}/members`)).json()[0].projectRole).toBe('Diseño UX');
    await ctx.as(pm).patch(`/api/projects/${project.id}/members/${ana.id}`, { projectRole: '' });
    expect((await ctx.as(pm).delete(`${url}/${created.json().id}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).get(url)).json()).toEqual([]);
  });
});
