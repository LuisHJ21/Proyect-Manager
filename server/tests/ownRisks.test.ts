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
    const res = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'TREATING', version: 1 });
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

  describe('versión del riesgo', () => {
    const conflict = 'Otra persona guardó cambios en este registro mientras editabas';
    const versionOf = async (id: string) => (await ctx.prisma.risk.findUniqueOrThrow({ where: { id } })).version;

    it('el PM edita con la versión actual y la sube; con una vieja recibe 409', async () => {
      const first = await ctx.as(pm).patch(`${base()}/${r1.id}`, { impact: 5, version: 1 });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ impact: 5, version: 2, score: 10, incidents: [expect.objectContaining({ number: 1 })] });
      const stale = await ctx.as(pm).patch(`${base()}/${r1.id}`, { impact: 1, version: 1 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error).toMatchObject({ code: 'edit_conflict', message: conflict });
      expect((await ctx.prisma.risk.findUniqueOrThrow({ where: { id: r1.id } })).impact).toBe(5);
    });

    it('el PM sin versión recibe 400 en el campo version', async () => {
      const res = await ctx.as(pm).patch(`${base()}/${r1.id}`, { impact: 5 });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.version).toBe('Recarga la página para editar este registro');
    });

    it('el colaborador cambia el estado con versión; repetirla choca', async () => {
      const ok = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'TREATING', version: 1 });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().version).toBe(2);
      expect((await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'CLOSED', version: 1 })).statusCode).toBe(409);
    });

    it('el colaborador sin versión recibe 400 y con otras claves sigue en 403', async () => {
      const missing = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'TREATING' });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error.fields.version).toBe('Recarga la página para editar este registro');
      const extra = await ctx.as(ana).patch(`${base()}/${r1.id}`, { status: 'TREATING', version: 1, description: 'Otra' });
      expect(extra.statusCode).toBe(403);
      expect(extra.json().error.message).toBe('Solo puedes cambiar el estado de los riesgos de los que eres responsable');
    });

    it('quitar al responsable del proyecto sube la versión de sus riesgos y de sus tareas', async () => {
      const task = await ctx.makeTask(project.id, { assignees: [ana] });
      const other = await ctx.makeTask(project.id, { assignees: [luis] });
      expect((await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`)).statusCode).toBe(200);
      expect(await versionOf(r1.id)).toBe(2);
      expect(await versionOf(r2.id)).toBe(1);
      expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).version).toBe(2);
      expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: other.id } })).version).toBe(1);
    });

    it('los interesados siguen editándose sin versión', async () => {
      const created = (await ctx.as(pm).post(`/api/projects/${project.id}/stakeholders`, { name: 'Dirección', influence: 'HIGH', interest: 'LOW' })).json();
      const res = await ctx.as(pm).patch(`/api/projects/${project.id}/stakeholders/${created.id}`, { name: 'Gerencia' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).not.toHaveProperty('version');
    });
  });
});
