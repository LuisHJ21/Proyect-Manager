import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const risk = { description: 'Retraso', type: 'THREAT', probability: 4, impact: 5, response: 'MITIGATE' };
const samples: Record<string, object> = {
  objectives: { description: 'Lanzar', metric: 'Fecha', target: 'Marzo' },
  milestones: { name: 'Inicio', dueDate: '2026-12-01' },
  stakeholders: { name: 'Dirección', influence: 'HIGH', interest: 'LOW' },
  risks: risk,
  expenses: { description: 'Licencia', amountCents: 1050, date: '2026-11-01', category: 'SERVICES' },
};

describe('registros del proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  let member: User;
  let project: Project;
  const url = (path: string) => `/api/projects/${project.id}/${path}`;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    member = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [member] });
  });
  afterEach(() => ctx.close());

  it.each(Object.keys(samples))('PM crea, edita, lista y elimina en %s', async (path) => {
    const client = ctx.as(pm);
    const created = await client.post(url(path), samples[path]);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await client.get(url(path))).json()).toHaveLength(1);
    expect((await client.patch(`${url(path)}/${id}`, {})).statusCode).toBe(200);
    expect((await client.delete(`${url(path)}/${id}`)).statusCode).toBe(200);
    expect((await client.get(url(path))).json()).toHaveLength(0);
  });

  it.each(['stakeholders', 'expenses'])('colaborador miembro recibe 403 en %s', async (path) => {
    const client = ctx.as(member);
    expect((await client.get(url(path))).statusCode).toBe(403);
    expect((await client.post(url(path), samples[path])).statusCode).toBe(403);
  });

  it.each(['objectives', 'milestones'])('colaborador lee %s y recibe 403 al escribir', async (path) => {
    const client = ctx.as(member);
    expect((await client.get(url(path))).statusCode).toBe(200);
    expect((await client.post(url(path), samples[path])).statusCode).toBe(403);
  });

  it('no miembro recibe 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(url('objectives'))).statusCode).toBe(404);
  });

  it('un ítem de otro proyecto responde 404', async () => {
    const other = await ctx.makeProject();
    const created = await ctx.as(pm).post(`/api/projects/${other.id}/milestones`, samples.milestones);
    const itemUrl = `${url('milestones')}/${created.json().id}`;
    expect((await ctx.as(pm).patch(itemUrl, { name: 'X' })).statusCode).toBe(404);
    expect((await ctx.as(pm).delete(itemUrl)).statusCode).toBe(404);
  });

  it('riesgo devuelve score=20 con probabilidad 4 e impacto 5', async () => {
    const res = await ctx.as(pm).post(url('risks'), risk);
    expect(res.json().score).toBe(20);
    expect((await ctx.as(pm).get(url('risks'))).json()[0].score).toBe(20);
  });

  it('rechaza probabilidad 6', async () => {
    const res = await ctx.as(pm).post(url('risks'), { ...risk, probability: 6 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.probability).toBeTruthy();
  });

  it('rechaza respuesta EXPLOIT en una amenaza', async () => {
    const res = await ctx.as(pm).post(url('risks'), { ...risk, response: 'EXPLOIT' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.response).toBeTruthy();
  });

  it('al editar, valida la respuesta contra el tipo guardado', async () => {
    const created = await ctx.as(pm).post(url('risks'), risk);
    const res = await ctx.as(pm).patch(`${url('risks')}/${created.json().id}`, { type: 'OPPORTUNITY' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.response).toBeTruthy();
  });

  it('el responsable del riesgo debe ser miembro', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    const bad = await ctx.as(pm).post(url('risks'), { ...risk, ownerId: outsider.id });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.ownerId).toBeTruthy();
    expect((await ctx.as(pm).post(url('risks'), { ...risk, ownerId: member.id })).statusCode).toBe(201);
  });

  it.each([-100, 10.5, 0])('rechaza gasto con amountCents=%s', async (amountCents) => {
    const res = await ctx.as(pm).post(url('expenses'), { ...samples.expenses, amountCents });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.amountCents).toBeTruthy();
  });

  it('el hito exige una fecha válida', async () => {
    const res = await ctx.as(pm).post(url('milestones'), { name: 'X', dueDate: '2026-13-01' });
    expect(res.json().error.fields.dueDate).toBeTruthy();
  });
});
