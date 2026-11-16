import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('registro de supuestos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  const TODAY = '2026-11-17';
  const url = () => `/api/projects/${project.id}/assumptions`;
  const convert = (id: string, kind: string) => ctx.as(pm).post(`${url()}/${id}/convert`, { kind });
  const falseOne = async (description = '<p>El cliente entrega los planos a tiempo</p>') => {
    const created = (await ctx.as(pm).post(url(), { description, ownerId: ana.id })).json();
    return (await ctx.as(pm).patch(`${url()}/${created.id}`, { status: 'FALSE', version: created.version })).json();
  };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs] });
  });
  afterEach(() => ctx.close());

  it('numera SUP-N, marca vencidos y todos leen pero solo el PM escribe', async () => {
    const first = await ctx.as(pm).post(url(), { description: 'A', validateBy: '2026-11-16' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ number: 1, status: 'PENDING', overdue: true, owner: null, risk: null, incident: null, version: 1 });
    expect((await ctx.as(pm).post(url(), { description: 'B', validateBy: TODAY })).json()).toMatchObject({ number: 2, overdue: false });
    for (const user of [ana, obs]) {
      expect((await ctx.as(user).get(url())).json()).toHaveLength(2);
      expect((await ctx.as(user).post(url(), { description: 'X' })).statusCode).toBe(403);
    }
    expect((await ctx.as(pm).patch(`${url()}/${first.json().id}`, { status: 'VALID', version: 9 })).statusCode).toBe(409);
  });

  it('solo se convierte un supuesto falso, y una sola vez', async () => {
    const pending = (await ctx.as(pm).post(url(), { description: 'A' })).json();
    const early = await convert(pending.id, 'risk');
    expect(early.statusCode).toBe(409);
    expect(early.json().error.message).toBe('Solo se convierte un supuesto falso');
    const assumption = await falseOne();
    const res = await convert(assumption.id, 'risk');
    expect(res.statusCode).toBe(200);
    expect(res.json().risk).toEqual({ id: expect.any(String) });
    const risk = await ctx.prisma.risk.findUniqueOrThrow({ where: { id: res.json().risk.id } });
    expect(risk).toMatchObject({ type: 'THREAT', probability: 3, impact: 3, response: 'MITIGATE', ownerId: ana.id, description: '<p>El cliente entrega los planos a tiempo</p>' });
    expect(await ctx.prisma.riskAssessment.count({ where: { riskId: risk.id } })).toBe(1);
    const again = await convert(assumption.id, 'incident');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('Este supuesto ya se convirtió');
  });

  it('dos conversiones simultáneas crean un solo riesgo', async () => {
    const assumption = await falseOne();
    const results = await Promise.all([convert(assumption.id, 'risk'), convert(assumption.id, 'risk')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await ctx.prisma.risk.count()).toBe(1);
  });

  it('a incidente con el título en texto plano truncado', async () => {
    const assumption = await falseOne(`<p>${'x'.repeat(250)}</p>`);
    const res = await convert(assumption.id, 'incident');
    expect(res.json().incident).toEqual({ id: expect.any(String), number: 1 });
    const incident = await ctx.prisma.incident.findUniqueOrThrow({ where: { id: res.json().incident.id } });
    expect(incident.title.length).toBeLessThanOrEqual(200);
    expect(incident).toMatchObject({ ownerId: ana.id, reportedById: pm.id });
  });
});
