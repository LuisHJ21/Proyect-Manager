import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const OWNER_MESSAGE = 'Un observador no puede ser responsable';

describe('perfil Observador en usuarios y responsables', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let olga: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    project = await ctx.makeProject({ members: [ana, olga] });
  });
  afterEach(() => ctx.close());

  const giveWork = async (projectId: string, status = { task: 'TODO', risk: 'OPEN', incident: 'OPEN', stepDone: false }) => {
    const task = await ctx.makeTask(projectId, { assignees: [ana] });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: status.task } });
    await ctx.makeStep(task.id, { done: status.stepDone, completedById: status.stepDone ? ana.id : undefined });
    await ctx.prisma.risk.create({
      data: { projectId, description: 'R', type: 'THREAT', probability: 1, impact: 1, response: 'ACCEPT', ownerId: ana.id, status: status.risk },
    });
    await ctx.prisma.incident.create({ data: { projectId, number: 1, title: 'I', reportedById: pm.id, ownerId: ana.id, status: status.incident } });
  };

  it('el PM crea un observador', async () => {
    const res = await ctx.as(pm).post('/api/users', { name: 'Óscar', email: 'oscar@x.com', role: 'OBSERVER', temporaryPassword: 'temporal-12345' });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('OBSERVER');
  });

  it('cambiar a Observador con trabajo abierto responde 409 con los conteos', async () => {
    await giveWork(project.id);
    const res = await ctx.as(pm).patch(`/api/users/${ana.id}`, { role: 'OBSERVER' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'observer_has_work',
      message: 'Tiene trabajo abierto: reasígnalo antes de cambiar su perfil a Observador',
      details: { tasks: 1, steps: 0, risks: 1, incidents: 1 },
    });
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).role).toBe('COLLABORATOR');
  });

  it('con todo terminado o cerrado, el cambio procede y no borra nada', async () => {
    await giveWork(project.id, { task: 'DONE', risk: 'CLOSED', incident: 'CLOSED', stepDone: true });
    const res = await ctx.as(pm).patch(`/api/users/${ana.id}`, { role: 'OBSERVER' });
    expect(res.statusCode).toBe(200);
    expect(await ctx.prisma.taskAssignee.count({ where: { userId: ana.id } })).toBe(1);
  });

  it('el trabajo de proyectos cerrados no cuenta', async () => {
    const closed = await ctx.makeProject({ name: 'Viejo', members: [ana] });
    await giveWork(closed.id);
    await ctx.prisma.project.update({ where: { id: closed.id }, data: { status: 'CLOSED' } });
    expect((await ctx.as(pm).patch(`/api/users/${ana.id}`, { role: 'OBSERVER' })).statusCode).toBe(200);
  });

  it('el único PM activo no puede pasar a Observador', async () => {
    const res = await ctx.as(pm).patch(`/api/users/${pm.id}`, { role: 'OBSERVER' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('last_pm');
  });

  it('un observador no puede ser responsable de un riesgo', async () => {
    const base = `/api/projects/${project.id}/risks`;
    const body = { description: 'R', type: 'THREAT', probability: 2, impact: 2, response: 'ACCEPT' };
    const created = await ctx.as(pm).post(base, { ...body, ownerId: olga.id });
    expect(created.statusCode).toBe(400);
    expect(created.json().error.fields.ownerId).toBe(OWNER_MESSAGE);
    const risk = (await ctx.as(pm).post(base, body)).json();
    const patched = await ctx.as(pm).patch(`${base}/${risk.id}`, { ownerId: olga.id, version: 1 });
    expect(patched.statusCode).toBe(400);
    expect(patched.json().error.fields.ownerId).toBe(OWNER_MESSAGE);
  });

  it('un observador no puede ser responsable de un incidente', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/incidents`, { title: 'Caída', ownerId: olga.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.ownerId).toBe(OWNER_MESSAGE);
  });

  it('un observador no puede tener tareas asignadas', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [olga.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.assigneeIds).toBeTruthy();
  });

  it('un observador sí puede estar en la RACI', async () => {
    const base = `/api/projects/${project.id}/raci`;
    const activity = (await ctx.as(pm).post(`${base}/activities`, { title: 'Diseño' })).json();
    const res = await ctx.as(pm).put(`${base}/cells`, { activityId: activity.id, kind: 'member', partyId: olga.id, role: 'I' });
    expect(res.statusCode).toBe(200);
  });
});
