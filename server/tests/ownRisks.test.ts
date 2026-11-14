import type { Project, Risk, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('riesgos propios del colaborador', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  let r1: Risk;
  let r2: Risk;
  const base = () => `/api/projects/${project.id}/risks`;
  const makeRisk = (description: string, ownerId: string) =>
    ctx.prisma.risk.create({ data: { projectId: project.id, description, type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE', ownerId } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana, luis] });
    r1 = await makeRisk('Proveedor tarde', ana.id);
    r2 = await makeRisk('Servidor caído', luis.id);
    await ctx.prisma.incident.create({ data: { projectId: project.id, number: 1, title: 'Retraso', reportedById: pm.id, riskId: r1.id } });
  });
  afterEach(() => ctx.close());

  it('el colaborador ve solo los suyos, con puntaje y sin incidentes', async () => {
    const res = await ctx.as(ana).get(base());
    expect(res.statusCode).toBe(200);
    expect(res.json().map((r: Risk) => r.id)).toEqual([r1.id]);
    expect(res.json()[0].score).toBe(6);
    expect(res.json()[0]).not.toHaveProperty('incidents');
  });

  it('cambia el estado de su riesgo', async () => {
    const res = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'TREATING' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('TREATING');
    expect(res.json()).not.toHaveProperty('incidents');
  });

  it('no cambia otros campos', async () => {
    const res = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'CLOSED', impact: 5 });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe('Solo puedes cambiar el estado de los riesgos de los que eres responsable');
    expect((await ctx.prisma.risk.findUniqueOrThrow({ where: { id: r1.id } })).impact).toBe(3);
  });

  it('el riesgo ajeno responde 404', async () => {
    expect((await ctx.as(ana).patch(`${base()}/${r2.id}`, { status: 'CLOSED' })).statusCode).toBe(404);
  });

  it('no crea ni borra riesgos', async () => {
    const body = { description: 'X', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT' };
    expect((await ctx.as(ana).post(base(), body)).statusCode).toBe(403);
    expect((await ctx.as(ana).delete(`${base()}/${r1.id}`)).statusCode).toBe(403);
  });

  it('los indicadores siguen sin riesgos para el colaborador', async () => {
    const indicators = (await ctx.as(ana).get(`/api/projects/${project.id}/indicators`)).json();
    expect(JSON.stringify(indicators)).not.toMatch(/risk/i);
  });

  it('el PM ve todos con sus incidentes', async () => {
    const risks = (await ctx.as(pm).get(base())).json();
    expect(risks).toHaveLength(2);
    expect(risks.find((r: Risk) => r.id === r1.id).incidents).toHaveLength(1);
  });
});
