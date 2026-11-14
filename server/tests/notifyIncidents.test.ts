import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('avisos de incidentes', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const p = () => `/api/projects/${project.id}`;
  const of = (user: User) => ctx.prisma.notification.findMany({ where: { userId: user.id } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana, luis] });
  });
  afterEach(() => ctx.close());

  it('crear con responsable avisa al responsable', async () => {
    const res = await ctx.as(pm).post(`${p()}/incidents`, { title: 'Caída', ownerId: ana.id });
    expect(res.statusCode).toBe(201);
    expect(await of(ana)).toEqual([expect.objectContaining({ kind: 'INCIDENT_ASSIGNED', title: 'INC-1 Caída', entityId: res.json().id, projectId: project.id })]);
  });

  it('cambiar el responsable avisa solo al nuevo', async () => {
    const incident = (await ctx.as(pm).post(`${p()}/incidents`, { title: 'Caída', ownerId: ana.id })).json();
    expect((await ctx.as(pm).patch(`${p()}/incidents/${incident.id}`, { ownerId: luis.id })).statusCode).toBe(200);
    expect(await of(luis)).toHaveLength(1);
    expect(await of(ana)).toHaveLength(1);
  });

  it('editar otro campo no avisa', async () => {
    const incident = (await ctx.as(pm).post(`${p()}/incidents`, { title: 'Caída', ownerId: ana.id })).json();
    expect((await ctx.as(pm).patch(`${p()}/incidents/${incident.id}`, { priority: 'HIGH' })).statusCode).toBe(200);
    expect(await of(ana)).toHaveLength(1);
  });

  it('desde un riesgo avisa al responsable del riesgo', async () => {
    const body = { description: '<p>Servidor caído</p>', type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE', ownerId: ana.id };
    const risk = (await ctx.as(pm).post(`${p()}/risks`, body)).json();
    const res = await ctx.as(pm).post(`${p()}/risks/${risk.id}/incident`, {});
    expect(res.statusCode).toBe(201);
    expect(await of(ana)).toEqual([expect.objectContaining({ kind: 'INCIDENT_ASSIGNED', title: `INC-1 ${res.json().title}` })]);
  });

  it('un colaborador que reporta no genera avisos', async () => {
    expect((await ctx.as(ana).post(`${p()}/incidents`, { title: 'Error' })).statusCode).toBe(201);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });
});
