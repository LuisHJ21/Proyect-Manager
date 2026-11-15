import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('avisos de cambios', () => {
  let ctx: TestCtx;
  let paula: User;
  let pedro: User;
  let retired: User;
  let ana: User;
  let project: Project;
  const base = () => `/api/projects/${project.id}/change-requests`;
  const of = (user: User) => ctx.prisma.notification.findMany({ where: { userId: user.id } });
  const propose = async () => (await ctx.as(ana).post(base(), { title: 'Agregar blog' })).json();
  const decide = (id: string, status: 'APPROVED' | 'REJECTED', by = paula) => ctx.as(by).post(`${base()}/${id}/decision`, { status, note: 'Listo' });

  beforeEach(async () => {
    ctx = await createTestApp();
    paula = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    pedro = await ctx.makeUser({ role: 'PM', name: 'Pedro' });
    retired = await ctx.makeUser({ role: 'PM', name: 'Rita', active: false });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    return ctx.close();
  });

  it('proponer avisa a los PM activos', async () => {
    const cr = await propose();
    for (const pm of [paula, pedro]) {
      expect(await of(pm)).toEqual([expect.objectContaining({ kind: 'CHANGE_PROPOSED', title: 'CR-1 Agregar blog', actorName: 'Ana', entityId: cr.id, projectId: project.id })]);
    }
    expect(await of(retired)).toEqual([]);
    expect(await of(ana)).toEqual([]);
  });

  it('crear como PM no avisa', async () => {
    await ctx.as(paula).post(base(), { title: 'Del PM' });
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('decidir avisa a quien propuso', async () => {
    const cr = await propose();
    expect((await decide(cr.id, 'APPROVED')).statusCode).toBe(200);
    expect(await of(ana)).toEqual([expect.objectContaining({ kind: 'CHANGE_DECIDED', detail: 'APPROVED', title: 'CR-1 Agregar blog', entityId: cr.id })]);
    expect((await of(pedro)).map((n) => n.kind)).toEqual(['CHANGE_PROPOSED']);
  });

  it('rechazar lleva REJECTED', async () => {
    const cr = await propose();
    await decide(cr.id, 'REJECTED');
    expect((await of(ana))[0]).toMatchObject({ kind: 'CHANGE_DECIDED', detail: 'REJECTED' });
  });

  it('decidir una solicitud del PM no avisa', async () => {
    const cr = (await ctx.as(paula).post(base(), { title: 'Del PM' })).json();
    await decide(cr.id, 'APPROVED', pedro);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('si quien propuso ya no está activo, la decisión responde igual', async () => {
    const cr = await propose();
    await ctx.prisma.user.update({ where: { id: ana.id }, data: { active: false } });
    expect((await decide(cr.id, 'APPROVED')).statusCode).toBe(200);
    expect(await of(ana)).toEqual([]);
  });

  it('un fallo de los avisos no cambia la respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ctx.prisma.notification, 'createMany').mockRejectedValue(new Error('Base caída'));
    const res = await ctx.as(ana).post(base(), { title: 'Agregar blog' });
    expect(res.statusCode).toBe(201);
    expect((await decide(res.json().id, 'APPROVED')).statusCode).toBe(200);
  });
});
