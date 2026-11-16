import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('métricas de calidad', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  const TODAY = '2026-11-16';
  const url = () => `/api/projects/${project.id}/quality-metrics`;

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs] });
  });
  afterEach(() => ctx.close());

  it('el PM crea una métrica, mide y los demás leen', async () => {
    const portal = await ctx.prisma.deliverable.create({ data: { projectId: project.id, number: 1, name: 'Portal' } });
    const created = await ctx.as(pm).post(url(), { name: 'Cobertura de pruebas', unit: '%', target: 80.5, deliverableId: portal.id });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Cobertura de pruebas', target: 80.5, direction: 'HIGHER_BETTER', deliverable: { id: portal.id, number: 1, name: 'Portal' }, latest: null, met: null, measurements: [] });
    const id = created.json().id;
    const measured = await ctx.as(pm).post(`${url()}/${id}/measurements`, { date: '2026-11-15', value: 82.25, note: 'Sprint 3' });
    expect(measured.statusCode).toBe(201);
    expect(measured.json()).toMatchObject({ latest: { date: '2026-11-15', value: 82.25 }, met: true, measurements: [{ date: '2026-11-15', value: 82.25, note: 'Sprint 3' }] });
    for (const user of [ana, obs]) {
      const list = await ctx.as(user).get(url());
      expect(list.statusCode).toBe(200);
      expect(list.json()[0]).toMatchObject({ met: true });
      expect((await ctx.as(user).post(`${url()}/${id}/measurements`, { date: TODAY, value: 1 })).statusCode).toBe(403);
      expect((await ctx.as(user).post(url(), { name: 'X', target: 1 })).statusCode).toBe(403);
    }
    const edited = await ctx.as(pm).patch(`${url()}/${id}`, { target: 90 });
    expect(edited.json()).toMatchObject({ target: 90, met: false });
  });

  it('una medición futura da 400 y una medición se puede borrar', async () => {
    const metric = (await ctx.as(pm).post(url(), { name: 'Defectos abiertos', target: 2, direction: 'LOWER_BETTER' })).json();
    const future = await ctx.as(pm).post(`${url()}/${metric.id}/measurements`, { date: '2026-11-17', value: 1 });
    expect(future.statusCode).toBe(400);
    expect(JSON.stringify(future.json())).toContain('No se registran mediciones futuras');
    const measured = (await ctx.as(pm).post(`${url()}/${metric.id}/measurements`, { date: TODAY, value: 1 })).json();
    const removed = await ctx.as(pm).delete(`${url()}/${metric.id}/measurements/${measured.measurements[0].id}`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ latest: null, measurements: [] });
    expect((await ctx.as(pm).delete(`${url()}/${metric.id}`)).statusCode).toBe(200);
  });

  it('un entregable de otro proyecto da 400', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.prisma.deliverable.create({ data: { projectId: other.id, number: 1, name: 'Ajeno' } });
    const res = await ctx.as(pm).post(url(), { name: 'X', target: 1, deliverableId: foreign.id });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('El entregable no pertenece a este proyecto');
  });
});
