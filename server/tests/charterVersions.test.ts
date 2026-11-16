import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const complete = { justification: '<p>J</p>', scopeIncluded: '<p>A</p>', successCriteria: '<p>C</p>', sponsor: 'Gerencia' };

describe('versiones del acta', () => {
  let ctx: TestCtx;
  let pm: User;
  let obs: User;
  let project: Project;
  const url = () => `/api/projects/${project.id}/charter`;
  const current = async () => (await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } })).version;
  const save = async (body: object) => ctx.as(pm).put(url(), { ...complete, ...body, version: await current() });
  const approve = async () => ctx.as(pm).post(`${url()}/approve`, { version: await current() });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-16T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [obs] });
    await ctx.prisma.objective.create({ data: { projectId: project.id, description: 'Reducir tiempos', metric: 'Días', target: '10' } });
    await ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Entrega', dueDate: '2026-12-01' } });
  });
  afterEach(() => ctx.close());

  it('cada aprobación congela el acta, los objetivos y los hitos', async () => {
    await save({});
    expect((await approve()).statusCode).toBe(200);
    await save({ justification: '<p>J2</p>' });
    await ctx.prisma.milestone.updateMany({ where: { projectId: project.id }, data: { dueDate: '2026-12-15' } });
    expect((await approve()).statusCode).toBe(200);

    const list = (await ctx.as(pm).get(`${url()}/versions`)).json();
    expect(list).toEqual([
      { number: 2, approvedAt: expect.any(String), approvedBy: { id: pm.id, name: 'Paula' } },
      { number: 1, approvedAt: expect.any(String), approvedBy: { id: pm.id, name: 'Paula' } },
    ]);
    const first = (await ctx.as(obs).get(`${url()}/versions/1`)).json();
    expect(first).toMatchObject({ number: 1, approvedBy: { id: pm.id, name: 'Paula' } });
    expect(first.content).toMatchObject({
      sponsor: 'Gerencia',
      justification: '<p>J</p>',
      scopeIncluded: '<p>A</p>',
      objectives: [{ description: 'Reducir tiempos', metric: 'Días', target: '10', status: 'PENDING' }],
      milestones: [{ name: 'Entrega', dueDate: '2026-12-01', status: 'PENDING' }],
    });
    const second = (await ctx.as(obs).get(`${url()}/versions/2`)).json();
    expect(second.content).toMatchObject({ justification: '<p>J2</p>', milestones: [{ dueDate: '2026-12-15' }] });
  });

  it('una versión inexistente responde 404', async () => {
    const res = await ctx.as(pm).get(`${url()}/versions/9`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('Versión no encontrada');
  });

  it('dos aprobaciones con la misma versión crean una sola', async () => {
    await save({});
    const version = await current();
    const results = await Promise.all([ctx.as(pm).post(`${url()}/approve`, { version }), ctx.as(pm).post(`${url()}/approve`, { version })]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await ctx.prisma.charterVersion.count({ where: { projectId: project.id } })).toBe(1);
  });
});
