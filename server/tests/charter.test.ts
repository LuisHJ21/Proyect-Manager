import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const complete = { justification: 'J', scopeIncluded: 'A', successCriteria: 'C' };

describe('acta', () => {
  let ctx: TestCtx;
  let pm: User;
  let member: User;
  let project: Project;
  let url: string;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    member = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [member] });
    url = `/api/projects/${project.id}/charter`;
  });
  afterEach(() => ctx.close());

  it('no aprueba sin justificación, alcance incluido y criterios de éxito', async () => {
    const res = await ctx.as(pm).post(`${url}/approve`);
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().error.fields).sort()).toEqual(['justification', 'scopeIncluded', 'successCriteria']);
  });

  it('un campo con solo espacios no cuenta como completo', async () => {
    await ctx.as(pm).put(url, { ...complete, justification: '   ' });
    const res = await ctx.as(pm).post(`${url}/approve`);
    expect(Object.keys(res.json().error.fields)).toEqual(['justification']);
  });

  it('aprobar registra approvedById y approvedAt', async () => {
    await ctx.as(pm).put(url, complete);
    ctx.clock.set('2026-11-06T09:00:00');
    const res = await ctx.as(pm).post(`${url}/approve`);
    expect(res.json().status).toBe('APPROVED');
    expect(res.json().approvedById).toBe(pm.id);
    expect(res.json().approvedBy.name).toBe(pm.name);
    expect(new Date(res.json().approvedAt).getHours()).toBe(9);
  });

  it('editar un acta aprobada la devuelve a DRAFT y borra la aprobación', async () => {
    await ctx.as(pm).put(url, complete);
    await ctx.as(pm).post(`${url}/approve`);
    const res = await ctx.as(pm).put(url, { ...complete, sponsor: 'Dirección' });
    expect(res.json().status).toBe('DRAFT');
    expect(res.json().approvedById).toBeNull();
    expect(res.json().approvedAt).toBeNull();
  });

  it('guardar sin cambios conserva la aprobación', async () => {
    await ctx.as(pm).put(url, complete);
    await ctx.as(pm).post(`${url}/approve`);
    expect((await ctx.as(pm).put(url, complete)).json().status).toBe('APPROVED');
  });

  it('colaborador miembro lee el acta y recibe 403 al editar', async () => {
    expect((await ctx.as(member).get(url)).statusCode).toBe(200);
    expect((await ctx.as(member).put(url, complete)).statusCode).toBe(403);
    expect((await ctx.as(member).post(`${url}/approve`)).statusCode).toBe(403);
  });
});
