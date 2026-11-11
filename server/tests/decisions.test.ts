import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('riesgo a incidente', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const makeRisk = (over: object = {}) =>
    ctx.prisma.risk.create({
      data: { projectId: project.id, description: '<p><strong>Caída</strong> del servidor</p>', type: 'THREAT', probability: 4, impact: 5, response: 'MITIGATE', ownerId: ana.id, ...over },
    });
  const toIncident = (riskId: string, user = pm, projectId = project.id) => ctx.as(user).post(`/api/projects/${projectId}/risks/${riskId}/incident`);

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('pasar un riesgo a incidente', async () => {
    const high = await makeRisk();
    const res = await toIncident(high.id);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ number: 1, title: 'Caída del servidor', owner: { id: ana.id }, priority: 'HIGH', risk: { id: high.id } });
    const low = await makeRisk({ probability: 2, impact: 3 });
    expect((await toIncident(low.id)).json().priority).toBe('MEDIUM');
    const risks = (await ctx.as(pm).get(`/api/projects/${project.id}/risks`)).json();
    expect(risks.find((r: { id: string }) => r.id === high.id).incidents).toEqual([{ id: res.json().id, number: 1, title: 'Caída del servidor', status: 'OPEN' }]);
    expect((await ctx.prisma.risk.findUniqueOrThrow({ where: { id: high.id } })).status).toBe('OPEN');
  });

  it('título largo con formato', async () => {
    const risk = await makeRisk({ description: `<p><em>${'x'.repeat(300)}</em></p>` });
    const title = (await toIncident(risk.id)).json().title as string;
    expect(title).toHaveLength(200);
    expect(title).not.toContain('<');
  });

  it('colaborador 403 y riesgo de otro proyecto 404', async () => {
    const risk = await makeRisk();
    expect((await toIncident(risk.id, ana)).statusCode).toBe(403);
    const other = await ctx.makeProject();
    const foreign = await ctx.prisma.risk.create({ data: { projectId: other.id, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT' } });
    expect((await toIncident(foreign.id)).statusCode).toBe(404);
  });
});

describe('registro de decisiones', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const base = (id = project.id) => `/api/projects/${id}/decisions`;
  const decision = { title: 'Usar proveedor B', decidedOn: '2026-11-10' };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-10T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('permisos', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(ana).get(base())).statusCode).toBe(403);
    expect((await ctx.as(ana).post(base(), decision)).statusCode).toBe(403);
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
  });

  it('crea, lista, edita y borra con número correlativo', async () => {
    const first = await ctx.as(pm).post(base(), { ...decision, rationale: 'Más barato', decidedBy: 'Comité' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ number: 1, rationale: 'Más barato', decidedBy: 'Comité', changeRequest: null, incident: null });
    const second = (await ctx.as(pm).post(base(), decision)).json();
    expect((await ctx.as(pm).get(base())).json().map((d: { number: number }) => d.number)).toEqual([2, 1]);
    expect((await ctx.as(pm).patch(`${base()}/${second.id}`, { title: 'Usar proveedor C' })).json().title).toBe('Usar proveedor C');
    expect((await ctx.as(pm).delete(`${base()}/${second.id}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).post(base(), decision)).json().number).toBe(3);
  });

  it('valida enlaces de otro proyecto y devuelve los propios', async () => {
    const other = await ctx.makeProject();
    const foreignCr = (await ctx.as(pm).post(`/api/projects/${other.id}/change-requests`, { title: 'Ajeno' })).json();
    const foreignInc = (await ctx.as(pm).post(`/api/projects/${other.id}/incidents`, { title: 'Ajeno' })).json();
    for (const [field, value] of [['changeRequestId', foreignCr.id], ['incidentId', foreignInc.id]] as const) {
      const res = await ctx.as(pm).post(base(), { ...decision, [field]: value });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields[field]).toBeTruthy();
    }
    const cr = (await ctx.as(pm).post(`/api/projects/${project.id}/change-requests`, { title: 'Blog' })).json();
    const inc = (await ctx.as(pm).post(`/api/projects/${project.id}/incidents`, { title: 'Caída' })).json();
    const linked = (await ctx.as(pm).post(base(), { ...decision, changeRequestId: cr.id, incidentId: inc.id })).json();
    expect(linked.changeRequest).toEqual({ id: cr.id, number: 1, title: 'Blog' });
    expect(linked.incident).toEqual({ id: inc.id, number: 1, title: 'Caída' });
  });

  it('cerrar un incidente registrando la decisión', async () => {
    const inc = (await ctx.as(pm).post(`/api/projects/${project.id}/incidents`, { title: 'Caída', ownerId: ana.id })).json();
    await ctx.as(ana).patch(`/api/projects/${project.id}/incidents/${inc.id}`, { status: 'RESOLVED', resolution: 'Se reinició el servidor' });
    const asAna = await ctx.as(ana).patch(`/api/projects/${project.id}/incidents/${inc.id}`, { status: 'CLOSED', recordDecision: true });
    expect(asAna.statusCode).toBe(403);
    const closed = await ctx.as(pm).patch(`/api/projects/${project.id}/incidents/${inc.id}`, { status: 'CLOSED', recordDecision: true });
    expect(closed.statusCode).toBe(200);
    const [created] = (await ctx.as(pm).get(base())).json();
    expect(created).toMatchObject({
      title: 'Cierre de INC-1: Caída',
      rationale: 'Se reinició el servidor',
      decidedBy: 'Paula',
      decidedOn: '2026-11-10',
      incident: { number: 1 },
    });
  });

  it('recordDecision sin cerrar da 400', async () => {
    const inc = (await ctx.as(pm).post(`/api/projects/${project.id}/incidents`, { title: 'Caída' })).json();
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}/incidents/${inc.id}`, { status: 'IN_PROGRESS', recordDecision: true });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.recordDecision).toBeTruthy();
  });
});
