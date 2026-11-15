import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('registro de cambios', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const base = (id = project.id) => `/api/projects/${id}/change-requests`;
  const create = async (title = 'Agregar blog', projectId = project.id) => (await ctx.as(pm).post(base(projectId), { title })).json();

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('el colaborador no decide y no miembro 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    const cr = await create();
    const decide = (user: User) => ctx.as(user).post(`${base()}/${cr.id}/decision`, { status: 'APPROVED', note: 'Ok' });
    // Leer y proponer los cubre changeProposals.test.ts.
    expect((await decide(ana)).statusCode).toBe(403);
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
    expect((await ctx.as(outsider).post(base(), { title: 'X' })).statusCode).toBe(404);
    expect((await decide(outsider)).statusCode).toBe(404);
  });

  it('el número es correlativo por proyecto', async () => {
    const other = await ctx.makeProject();
    expect((await create('A')).number).toBe(1);
    const second = await create('B');
    expect(second.number).toBe(2);
    expect((await create('C', other.id)).number).toBe(1);
    await ctx.as(pm).delete(`${base()}/${second.id}`);
    expect((await create('D')).number).toBe(3);
    const list = (await ctx.as(pm).get(base())).json();
    expect(list.map((c: { number: number }) => c.number)).toEqual([3, 1]);
  });

  it('crea con impactos negativos y los devuelve como número', async () => {
    const res = await ctx.as(pm).post(base(), {
      title: 'Recortar alcance',
      description: 'Quitar módulo',
      requestedBy: 'Dirección',
      scopeImpact: 'Sin reportes',
      scheduleImpactDays: -5,
      costImpactCents: -250000,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      number: 1,
      title: 'Recortar alcance',
      requestedBy: 'Dirección',
      scheduleImpactDays: -5,
      costImpactCents: -250000,
      status: 'PENDING',
      decidedBy: null,
    });
    const titleless = await ctx.as(pm).post(base(), { title: ' ' });
    expect(titleless.statusCode).toBe(400);
    expect(titleless.json().error.fields.title).toBeTruthy();
  });

  it('decidir exige nota y guarda quién y cuándo', async () => {
    const cr = await create();
    const empty = await ctx.as(pm).post(`${base()}/${cr.id}/decision`, { status: 'APPROVED', note: '' });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.fields.note).toBeTruthy();
    ctx.clock.set('2026-11-08T10:00:00');
    const res = await ctx.as(pm).post(`${base()}/${cr.id}/decision`, { status: 'APPROVED', note: 'Vale la pena' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'APPROVED', decisionNote: 'Vale la pena', decidedBy: { id: pm.id, name: pm.name } });
    expect(new Date(res.json().decidedAt).getTime()).toBe(new Date('2026-11-08T10:00:00').getTime());
  });

  it('una decidida no se edita, no se decide de nuevo ni se borra', async () => {
    const cr = await create();
    await ctx.as(pm).post(`${base()}/${cr.id}/decision`, { status: 'REJECTED', note: 'No' });
    for (const res of [
      await ctx.as(pm).patch(`${base()}/${cr.id}`, { title: 'X' }),
      await ctx.as(pm).post(`${base()}/${cr.id}/decision`, { status: 'APPROVED', note: 'Sí' }),
      await ctx.as(pm).delete(`${base()}/${cr.id}`),
    ]) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('change_decided');
    }
  });

  it('una pendiente se edita y se borra', async () => {
    const cr = await create();
    expect((await ctx.as(pm).patch(`${base()}/${cr.id}`, { title: 'Nuevo', costImpactCents: 100 })).json()).toMatchObject({ title: 'Nuevo', costImpactCents: 100 });
    expect((await ctx.as(pm).delete(`${base()}/${cr.id}`)).statusCode).toBe(200);
  });

  it('una solicitud de otro proyecto responde 404', async () => {
    const other = await ctx.makeProject();
    const foreign = await create('Ajena', other.id);
    expect((await ctx.as(pm).patch(`${base()}/${foreign.id}`, { title: 'X' })).statusCode).toBe(404);
    expect((await ctx.as(pm).post(`${base()}/${foreign.id}/decision`, { status: 'APPROVED', note: 'x' })).statusCode).toBe(404);
    expect((await ctx.as(pm).delete(`${base()}/${foreign.id}`)).statusCode).toBe(404);
  });
});
