import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const COST_KEYS = ['plannedCostCents', 'plannedBudgetCents', 'amountCents', 'spentCents', 'currency', 'contingencyReserveCents', 'managementReserveCents'];

describe('lo que lee el observador', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let olga: User;
  let a: Project;
  let b: Project;
  let task: Task;
  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-11T10:00:00');
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    a = await ctx.makeProject({ name: 'A', members: [ana, olga], plannedBudgetCents: 500000 });
    b = await ctx.makeProject({ name: 'B', members: [ana] });
    task = await ctx.makeTask(a.id, { title: 'Diseño', assignees: [ana] });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { dueDate: '2026-11-20', plannedCostCents: 1000 } });
    await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'Avance' });
  });
  afterEach(() => ctx.close());

  it('no lee incidentes', async () => {
    const incident = (await ctx.as(pm).post(`/api/projects/${a.id}/incidents`, { title: 'Caída' })).json();
    expect((await ctx.as(olga).get(`/api/projects/${a.id}/incidents`)).statusCode).toBe(403);
    expect((await ctx.as(olga).get(`/api/projects/${a.id}/incidents/${incident.id}`)).statusCode).toBe(403);
  });

  it('el detalle de tarea no trae comentarios para el observador', async () => {
    const res = await ctx.as(olga).get(`/api/tasks/${task.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('comments');
    expect((await ctx.as(ana).get(`/api/tasks/${task.id}`)).json().comments).toHaveLength(1);
  });

  it('Mis tareas del observador está vacía', async () => {
    const done = await ctx.makeTask(a.id, { title: 'Vieja', assignees: [olga] });
    await ctx.prisma.task.update({ where: { id: done.id }, data: { status: 'DONE' } });
    const res = await ctx.as(olga).get('/api/me/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('la biblioteca de lecciones solo trae las de sus proyectos', async () => {
    await ctx.as(ana).post(`/api/projects/${a.id}/lessons`, { type: 'WORKED_WELL', category: 'TEAM', situation: 'De A' });
    await ctx.as(ana).post(`/api/projects/${b.id}/lessons`, { type: 'WORKED_WELL', category: 'TEAM', situation: 'De B' });
    const lessons = (await ctx.as(olga).get('/api/lessons')).json();
    expect(lessons.map((l: { situation: string }) => l.situation)).toEqual(['De A']);
    expect((await ctx.as(ana).get('/api/lessons')).json()).toHaveLength(2);
  });

  it('el calendario trae las tareas e hitos de sus proyectos, asignadas o no', async () => {
    const other = await ctx.makeTask(b.id, { title: 'Ajena' });
    await ctx.prisma.task.update({ where: { id: other.id }, data: { dueDate: '2026-11-21' } });
    await ctx.prisma.milestone.create({ data: { projectId: a.id, name: 'Entrega A', dueDate: '2026-11-25' } });
    await ctx.prisma.milestone.create({ data: { projectId: b.id, name: 'Entrega B', dueDate: '2026-11-25' } });
    const res = (await ctx.as(olga).get('/api/calendar?from=2026-11-01&to=2026-11-30')).json();
    expect(res.tasks.map((t: { title: string }) => t.title)).toEqual(['Diseño']);
    expect(res.milestones.map((m: { name: string }) => m.name)).toEqual(['Entrega A']);
  });

  it('ninguna respuesta del observador trae costos', async () => {
    const urls = [
      '/api/projects',
      `/api/projects/${a.id}`,
      `/api/projects/${a.id}/tasks`,
      `/api/tasks/${task.id}`,
      `/api/projects/${a.id}/indicators`,
      '/api/calendar?from=2026-11-01&to=2026-11-30',
    ];
    for (const url of urls) {
      const res = await ctx.as(olga).get(url);
      expect(res.statusCode, url).toBe(200);
      for (const key of COST_KEYS) expect(res.body, `${url} → ${key}`).not.toContain(`"${key}"`);
    }
  });
});

describe('el observador que antes fue colaborador', () => {
  let ctx: TestCtx;
  afterEach(() => ctx.close());

  it('no recibe incidentes en el detalle de tarea aunque los haya reportado', async () => {
    ctx = await createTestApp();
    await ctx.makeUser({ role: 'PM' });
    const olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    const project = await ctx.makeProject({ members: [olga] });
    const task = await ctx.makeTask(project.id);
    await ctx.prisma.incident.create({ data: { projectId: project.id, number: 1, title: 'Caída', reportedById: olga.id, taskId: task.id, status: 'CLOSED' } });
    const body = (await ctx.as(olga).get(`/api/tasks/${task.id}`)).json();
    expect(body.incidents ?? []).toEqual([]);
  });

  it('no se le puede asignar un paso de una tarea que ya tenía', async () => {
    ctx = await createTestApp();
    const pm = await ctx.makeUser({ role: 'PM' });
    const olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    const project = await ctx.makeProject({ members: [olga] });
    const task = await ctx.makeTask(project.id, { assignees: [olga] });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: 'DONE' } });
    const res = await ctx.as(pm).post(`/api/tasks/${task.id}/steps`, { title: 'Revisar', assigneeId: olga.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.assigneeId).toBe('Un observador no puede tener pasos asignados');
    const step = await ctx.prisma.taskStep.create({ data: { taskId: task.id, title: 'Otro' } });
    const patched = await ctx.as(pm).patch(`/api/tasks/${task.id}/steps/${step.id}`, { assigneeId: olga.id });
    expect(patched.statusCode).toBe(400);
  });
});
