import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('acceso por sección del proyecto', () => {
  let ctx: TestCtx;
  let observer: User;
  let collaborator: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    await ctx.makeUser({ role: 'PM' });
    observer = await ctx.makeUser({ role: 'OBSERVER' });
    collaborator = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [observer, collaborator] });
  });
  afterEach(() => ctx.close());

  it('el observador miembro lee el acta pero no las decisiones', async () => {
    expect((await ctx.as(observer).get(`/api/projects/${project.id}/charter`)).statusCode).toBe(200);
    expect((await ctx.as(observer).get(`/api/projects/${project.id}/decisions`)).statusCode).toBe(403);
  });

  it('el observador que no es miembro recibe 404', async () => {
    const other = await ctx.makeProject({ name: 'Otro' });
    expect((await ctx.as(observer).get(`/api/projects/${other.id}`)).statusCode).toBe(404);
  });

  it('el colaborador lee el registro de riesgos filtrado a los suyos', async () => {
    const res = await ctx.as(collaborator).get(`/api/projects/${project.id}/risks`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
