import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('proyectos y miembros', () => {
  let ctx: TestCtx;
  let pm: User;
  let member: User;
  let outsider: User;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    member = await ctx.makeUser({ role: 'COLLABORATOR' });
    outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
  });
  afterEach(() => ctx.close());

  it('crear un proyecto crea su acta en DRAFT', async () => {
    const res = await ctx.as(pm).post('/api/projects', { name: 'Portal', plannedBudgetCents: 500000, currency: 'mxn' });
    expect(res.statusCode).toBe(201);
    expect(res.json().currency).toBe('MXN');
    const charter = await ctx.as(pm).get(`/api/projects/${res.json().id}/charter`);
    expect(charter.json().status).toBe('DRAFT');
  });

  it('rechaza startDate posterior a endDate con fields.startDate', async () => {
    const body = { name: 'X', startDate: '2026-12-01', endDate: '2026-11-01' };
    const res = await ctx.as(pm).post('/api/projects', body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.startDate).toBeTruthy();
  });

  it('rechaza una fecha imposible', async () => {
    const res = await ctx.as(pm).post('/api/projects', { name: 'X', startDate: '2026-02-30' });
    expect(res.json().error.fields.startDate).toBeTruthy();
  });

  it('PATCH valida el orden de fechas contra los valores guardados', async () => {
    const p = (await ctx.as(pm).post('/api/projects', { name: 'X', endDate: '2026-11-01' })).json();
    const res = await ctx.as(pm).patch(`/api/projects/${p.id}`, { startDate: '2026-12-01' });
    expect(res.statusCode).toBe(400);
  });

  it('colaborador lista solo sus proyectos, sin datos de presupuesto', async () => {
    await ctx.makeProject({ name: 'Mío', members: [member], plannedBudgetCents: 999 });
    await ctx.makeProject({ name: 'Ajeno' });
    const list = (await ctx.as(member).get('/api/projects')).json();
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Mío']);
    expect(list[0]).not.toHaveProperty('plannedBudgetCents');
    expect(list[0]).not.toHaveProperty('currency');
  });

  it('el detalle tampoco envía presupuesto al colaborador', async () => {
    const p = await ctx.makeProject({ members: [member], plannedBudgetCents: 999 });
    const res = await ctx.as(member).get(`/api/projects/${p.id}`);
    expect(res.json()).not.toHaveProperty('plannedBudgetCents');
  });

  it('no miembro recibe 404 y miembro recibe 403 al editar', async () => {
    const p = await ctx.makeProject({ members: [member] });
    expect((await ctx.as(outsider).get(`/api/projects/${p.id}`)).statusCode).toBe(404);
    expect((await ctx.as(outsider).patch(`/api/projects/${p.id}`, { name: 'Y' })).statusCode).toBe(404);
    expect((await ctx.as(member).patch(`/api/projects/${p.id}`, { name: 'Y' })).statusCode).toBe(403);
  });

  it('colaborador no puede crear proyectos', async () => {
    expect((await ctx.as(member).post('/api/projects', { name: 'Y' })).statusCode).toBe(403);
  });

  it('todo PM ve todos los proyectos', async () => {
    await ctx.makeProject({ name: 'A' });
    const other = await ctx.makeUser({ role: 'PM' });
    expect((await ctx.as(other).get('/api/projects')).json()).toHaveLength(1);
  });

  it('DELETE exige confirmName exacto', async () => {
    const p = await ctx.makeProject({ name: 'Portal' });
    const res = await ctx.as(pm).delete(`/api/projects/${p.id}`, { confirmName: 'portal' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.confirmName).toBeTruthy();
    expect(await ctx.prisma.project.count()).toBe(1);
  });

  it('DELETE borra los archivos del disco', async () => {
    const p = await ctx.makeProject({ name: 'Portal' });
    mkdirSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    const file = join(ctx.dataDir, 'uploads', 'archivo-x');
    writeFileSync(file, 'x');
    await ctx.prisma.attachment.create({
      data: { projectId: p.id, uploadedById: pm.id, originalName: 'a.pdf', storedName: 'archivo-x', mimeType: 'application/pdf', size: 1 },
    });
    expect((await ctx.as(pm).delete(`/api/projects/${p.id}`, { confirmName: 'Portal' })).statusCode).toBe(200);
    expect(existsSync(file)).toBe(false);
  });

  it('añade miembros, rechaza inactivos y duplicados', async () => {
    const p = await ctx.makeProject();
    const url = `/api/projects/${p.id}/members`;
    const inactive = await ctx.makeUser({ role: 'COLLABORATOR', active: false });
    expect((await ctx.as(pm).post(url, { userId: inactive.id })).statusCode).toBe(400);
    expect((await ctx.as(pm).post(url, { userId: member.id, projectRole: 'Diseño' })).statusCode).toBe(201);
    expect((await ctx.as(pm).post(url, { userId: member.id })).statusCode).toBe(409);
    expect((await ctx.as(member).get(url)).json()[0].projectRole).toBe('Diseño');
  });

  it('impact informa tareas y riesgos; quitar al miembro limpia asignaciones y responsable', async () => {
    const p = await ctx.makeProject({ members: [member] });
    const task = await ctx.makeTask(p.id, { assignees: [member] });
    const risk = await ctx.prisma.risk.create({
      data: { projectId: p.id, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT', ownerId: member.id },
    });
    const url = `/api/projects/${p.id}/members/${member.id}`;
    expect((await ctx.as(pm).get(`${url}/impact`)).json()).toEqual({ tasks: 1, risks: 1 });
    expect((await ctx.as(pm).delete(url)).statusCode).toBe(200);
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(0);
    expect((await ctx.prisma.risk.findUniqueOrThrow({ where: { id: risk.id } })).ownerId).toBeNull();
    expect((await ctx.as(member).get(`/api/projects/${p.id}`)).statusCode).toBe(404);
  });
});
