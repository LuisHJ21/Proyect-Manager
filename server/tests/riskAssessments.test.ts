import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('riesgos completos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const TODAY = '2026-11-17';
  const url = () => `/api/projects/${project.id}/risks`;
  const base = { description: 'Lluvias', type: 'THREAT', probability: 3, impact: 4, response: 'MITIGATE' };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('el alta y cada cambio de evaluación quedan en el historial', async () => {
    const created = await ctx.as(pm).post(url(), { ...base, trigger: 'Pronóstico de lluvia', residualProbability: 2, residualImpact: 2, contingencyCostCents: 50000 });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ trigger: 'Pronóstico de lluvia', residualScore: 4, contingencyCostCents: 50000, assessments: [{ probability: 3, impact: 4, residualProbability: 2, residualImpact: 2, assessedBy: { id: pm.id, name: 'Paula' } }] });
    const id = created.json().id;
    const edited = await ctx.as(pm).patch(`${url()}/${id}`, { probability: 4, version: 1 });
    expect(edited.json().assessments).toHaveLength(2);
    expect(edited.json().assessments[0]).toMatchObject({ probability: 4, impact: 4 });
    const renamed = await ctx.as(pm).patch(`${url()}/${id}`, { responsePlan: '<p>Lonas</p>', version: 2 });
    expect(renamed.json().assessments).toHaveLength(2);
  });

  it('el responsable cambia el estado sin sumar evaluaciones ni recibir el costo de contingencia', async () => {
    const created = (await ctx.as(pm).post(url(), { ...base, ownerId: ana.id, contingencyCostCents: 50000 })).json();
    const res = await ctx.as(ana).patch(`${url()}/${created.id}`, { status: 'TREATING', version: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('contingencyCostCents');
    expect(res.json().assessments).toHaveLength(1);
    expect((await ctx.as(ana).get(url())).json()[0]).not.toHaveProperty('contingencyCostCents');
  });

  it('el residual a medias da 400', async () => {
    const res = await ctx.as(pm).post(url(), { ...base, residualImpact: 2 });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('Indica probabilidad e impacto residuales juntos');
  });

  it('marca la revisión vencida', async () => {
    const late = (await ctx.as(pm).post(url(), { ...base, nextReviewDate: '2026-11-16' })).json();
    const onTime = (await ctx.as(pm).post(url(), { ...base, nextReviewDate: TODAY })).json();
    expect(late.reviewOverdue).toBe(true);
    expect(onTime.reviewOverdue).toBe(false);
    const closed = await ctx.as(pm).patch(`${url()}/${late.id}`, { status: 'CLOSED', version: 1 });
    expect(closed.json().reviewOverdue).toBe(false);
  });
});
