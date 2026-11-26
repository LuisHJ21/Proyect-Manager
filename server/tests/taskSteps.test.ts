import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('pasos de tarea', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let project: Project;
  let task: Task;

  const url = (id = task.id) => `/api/tasks/${id}/steps`;
  const stepUrl = (stepId: string, id = task.id) => `/api/tasks/${id}/steps/${stepId}`;
  const current = () => ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  const detail = async () => (await ctx.as(pm).get(`/api/tasks/${task.id}`)).json();

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    project = await ctx.makeProject({ members: [ana, beto] });
    task = await ctx.makeTask(project.id, { assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('el asignado puede crear; solo el PM edita y elimina', async () => {
    const created = await ctx.as(pm).post(url(), { title: 'Paso' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await ctx.as(ana).post(url(), { title: 'X' })).statusCode).toBe(201);
    expect((await ctx.as(beto).post(url(), { title: 'X' })).statusCode).toBe(403);
    expect((await ctx.as(ana).patch(stepUrl(id), { title: 'X' })).statusCode).toBe(403);
    expect((await ctx.as(ana).delete(stepUrl(id))).statusCode).toBe(403);
    expect((await ctx.as(pm).patch(stepUrl(id), { title: 'Otro' })).json().title).toBe('Otro');
    expect((await ctx.as(pm).delete(stepUrl(id))).statusCode).toBe(200);
  });

  it('asignado y PM marcan; no asignado 403; no miembro 404', async () => {
    const step = await ctx.makeStep(task.id);
    expect((await ctx.as(ana).patch(stepUrl(step.id), { done: true })).json().completedBy).toEqual({ id: ana.id, name: 'Ana' });
    expect((await ctx.as(pm).patch(stepUrl(step.id), { done: false })).json().completedBy).toBeNull();
    expect((await ctx.as(beto).patch(stepUrl(step.id), { done: true })).statusCode).toBe(403);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).patch(stepUrl(step.id), { done: true })).statusCode).toBe(404);
  });

  it('un paso de otra tarea responde 404', async () => {
    const other = await ctx.makeTask(project.id);
    const step = await ctx.makeStep(other.id);
    expect((await ctx.as(pm).patch(stepUrl(step.id), { title: 'X' })).statusCode).toBe(404);
    expect((await ctx.as(pm).delete(stepUrl(step.id))).statusCode).toBe(404);
  });

  it('ignora una asignación antigua; el paso sigue sin persona', async () => {
    const res = await ctx.as(pm).post(url(), { title: 'Paso', assigneeId: beto.id });
    expect(res.statusCode).toBe(201);
    expect(res.json().completedBy).toBeNull();
  });

  it('un título vacío responde 400', async () => {
    const res = await ctx.as(pm).post(url(), { title: '  ' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.title).toBeTruthy();
  });

  it('marcar recalcula el avance y pasa Por hacer a En curso', async () => {
    const a = await ctx.makeStep(task.id);
    await ctx.makeStep(task.id);
    await ctx.makeStep(task.id);
    await ctx.as(ana).patch(stepUrl(a.id), { done: true });
    expect(await current()).toMatchObject({ progress: 33, status: 'IN_PROGRESS' });
  });

  it('marcar no cambia una tarea Bloqueada', async () => {
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: 'BLOCKED' } });
    const a = await ctx.makeStep(task.id);
    await ctx.as(ana).patch(stepUrl(a.id), { done: true });
    expect((await current()).status).toBe('BLOCKED');
  });

  it('crear un paso recalcula el avance y reabre una tarea Hecha', async () => {
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: 'DONE', progress: 100 } });
    await ctx.as(pm).post(url(), { title: 'Olvidado' });
    expect(await current()).toMatchObject({ progress: 0, status: 'IN_PROGRESS' });
  });

  it('desmarcar reabre una tarea Hecha', async () => {
    const a = await ctx.makeStep(task.id, { done: true });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: 'DONE', progress: 100 } });
    await ctx.as(ana).patch(stepUrl(a.id), { done: false });
    expect(await current()).toMatchObject({ progress: 0, status: 'IN_PROGRESS' });
  });

  it('eliminar recalcula; sin pasos conserva el último avance y se puede editar a mano', async () => {
    const a = await ctx.makeStep(task.id, { done: true });
    const b = await ctx.makeStep(task.id);
    await ctx.as(pm).patch(stepUrl(b.id), { title: 'B' });
    await ctx.as(pm).delete(stepUrl(b.id));
    expect((await current()).progress).toBe(100);
    await ctx.as(pm).delete(stepUrl(a.id));
    expect((await current()).progress).toBe(100);
    const manual = await ctx.as(ana).patch(`/api/tasks/${task.id}/progress`, { progress: 30 });
    expect(manual.statusCode).toBe(200);
    expect(manual.json().progress).toBe(30);
  });

  it('eliminar el último paso de una tarea Hecha la deja Hecha con su avance', async () => {
    const a = await ctx.makeStep(task.id, { done: true });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { status: 'DONE', progress: 100 } });
    await ctx.as(pm).delete(stepUrl(a.id));
    expect(await current()).toMatchObject({ progress: 100, status: 'DONE' });
  });

  it('con pasos, enviar progress responde 400 con fields.progress', async () => {
    await ctx.makeStep(task.id);
    const res = await ctx.as(ana).patch(`/api/tasks/${task.id}/progress`, { progress: 50 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.progress).toBeTruthy();
    expect((await current()).progress).toBe(0);
  });

  it('Hecha con pasos pendientes responde 409 steps_pending', async () => {
    await ctx.makeStep(task.id);
    const res = await ctx.as(ana).patch(`/api/tasks/${task.id}/progress`, { status: 'DONE' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('steps_pending');
    expect(res.json().error.details.pending).toBe(1);
    expect(res.json().error.message).toBe('Falta 1 paso por completar');
    expect((await current()).status).toBe('TODO');
  });

  it('Hecha con todos los pasos hechos se acepta; terminar pasos no la marca sola', async () => {
    const a = await ctx.makeStep(task.id);
    await ctx.as(ana).patch(stepUrl(a.id), { done: true });
    expect(await current()).toMatchObject({ progress: 100, status: 'IN_PROGRESS' });
    expect((await ctx.as(ana).patch(`/api/tasks/${task.id}/progress`, { status: 'DONE' })).statusCode).toBe(200);
    expect((await current()).status).toBe('DONE');
  });

  it('con predecesoras pendientes no se marca y sí se desmarca', async () => {
    const before = await ctx.makeTask(project.id, { title: 'Antes' });
    await ctx.as(pm).post(`/api/tasks/${task.id}/dependencies`, { predecessorId: before.id });
    const a = await ctx.makeStep(task.id);
    const b = await ctx.makeStep(task.id, { done: true });
    const res = await ctx.as(ana).patch(stepUrl(a.id), { done: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('predecessors_pending');
    expect((await ctx.as(ana).patch(stepUrl(b.id), { done: false })).statusCode).toBe(200);
  });

  describe('el registro de quién completó el paso permanece', () => {
    let step: { id: string };
    const completedBy = async () => (await ctx.prisma.taskStep.findUniqueOrThrow({ where: { id: step.id } })).completedById;
    beforeEach(async () => {
      step = await ctx.makeStep(task.id);
      await ctx.as(ana).patch(stepUrl(step.id), { done: true });
    });

    it('por PUT de asignados', async () => {
      await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [beto.id] });
      expect(await completedBy()).toBe(ana.id);
    });
    it('por PATCH con asignados', async () => {
      await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [], version: 1 });
      expect(await completedBy()).toBe(ana.id);
    });
    it('conservándolo como asignado sigue la persona', async () => {
      await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [ana.id, beto.id] });
      expect(await completedBy()).toBe(ana.id);
    });
    it('al salir del proyecto', async () => {
      await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`);
      expect(await completedBy()).toBe(ana.id);
    });
    it('pasar a Project Manager no le quita el paso', async () => {
      await ctx.as(pm).patch(`/api/users/${ana.id}`, { role: 'PM' });
      expect(await completedBy()).toBe(ana.id);
    });
  });

  it('borrar la tarea borra sus pasos', async () => {
    await ctx.makeStep(task.id);
    await ctx.as(pm).delete(`/api/tasks/${task.id}`);
    expect(await ctx.prisma.taskStep.count()).toBe(0);
  });

  it('el detalle incluye steps en orden y las listas stepsDone y stepsTotal', async () => {
    await ctx.as(pm).post(url(), { title: 'Primero' });
    const second = await ctx.as(pm).post(url(), { title: 'Segundo' });
    await ctx.as(ana).patch(stepUrl(second.json().id), { done: true });
    const body = await detail();
    expect(body.steps.map((s: { title: string }) => s.title)).toEqual(['Primero', 'Segundo']);
    expect(body.steps[0].completedBy).toBeNull();
    expect(body.steps[1].completedBy).toEqual({ id: ana.id, name: 'Ana' });
    const [listed] = (await ctx.as(pm).get(`/api/projects/${project.id}/tasks`)).json();
    expect(listed).toMatchObject({ stepsDone: 1, stepsTotal: 2 });
  });
});

describe('proyectos cerrados y cancelados no cuentan', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('Mis tareas, y los contadores y tareas de un usuario, excluyen proyectos no activos', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    const live = await ctx.makeProject({ members: [ana] });
    const dead = await ctx.makeProject({ members: [ana] });
    await ctx.prisma.project.update({ where: { id: dead.id }, data: { status: 'CANCELLED' } });
    await ctx.makeTask(live.id, { title: 'Viva', assignees: [ana] });
    await ctx.makeTask(dead.id, { title: 'Muerta', assignees: [ana], dueDate: '2026-01-01' });

    const mine = (await ctx.as(ana).get('/api/me/tasks')).json();
    expect(mine.map((t: { title: string }) => t.title)).toEqual(['Viva']);

    const users = (await ctx.as(pm).get('/api/users')).json();
    expect(users.find((u: { id: string }) => u.id === ana.id)).toMatchObject({ openTasks: 1, overdueTasks: 0 });

    const tasks = (await ctx.as(pm).get(`/api/users/${ana.id}/tasks`)).json();
    expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Viva']);
  });
});
