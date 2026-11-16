import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('plan de comunicaciones', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  const url = () => `/api/projects/${project.id}/communications`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs] });
  });
  afterEach(() => ctx.close());

  it('el PM crea una fila del plan y el colaborador y el observador reciben 403', async () => {
    const res = await ctx.as(pm).post(url(), { topic: 'Avance semanal', audience: 'Patrocinador', frequency: 'WEEKLY', channel: 'Correo', ownerId: ana.id });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ topic: 'Avance semanal', frequency: 'WEEKLY', owner: { id: ana.id, name: 'Ana' } });
    const list = (await ctx.as(pm).get(url())).json();
    expect(list).toHaveLength(1);
    const edited = await ctx.as(pm).patch(`${url()}/${list[0].id}`, { channel: 'Reunión' });
    expect(edited.json()).toMatchObject({ channel: 'Reunión' });
    for (const user of [ana, obs]) {
      expect((await ctx.as(user).get(url())).statusCode).toBe(403);
    }
    expect((await ctx.as(ana).post(url(), { topic: 'X' })).statusCode).toBe(403);
    expect((await ctx.as(pm).delete(`${url()}/${list[0].id}`)).statusCode).toBe(200);
  });

  it('un observador no puede ser responsable', async () => {
    const res = await ctx.as(pm).post(url(), { topic: 'Avance', ownerId: obs.id });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('Un observador no puede ser responsable');
  });
});
