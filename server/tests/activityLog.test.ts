import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('bitácora: registro automático de escrituras', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let olga: User;
  let project: Project;
  let task: Task;
  const logs = () => ctx.prisma.activityLog.findMany({ orderBy: { createdAt: 'asc' } });
  const last = async () => (await logs()).at(-1)!;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    project = await ctx.makeProject({ members: [ana, luis, olga] });
    task = await ctx.makeTask(project.id, { title: 'Construcción', assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('crear una tarea deja un registro con su nombre', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Diseño' });
    expect(res.statusCode).toBe(201);
    expect(await last()).toMatchObject({
      projectId: project.id,
      userId: pm.id,
      entity: 'task',
      action: 'created',
      entityId: res.json().id,
      entityLabel: 'Diseño',
      changes: [],
    });
  });

  it('el avance del colaborador guarda el estado anterior y el nuevo', async () => {
    const res = await ctx.as(ana).patch(`/api/tasks/${task.id}/progress`, { status: 'IN_PROGRESS' });
    expect(res.statusCode).toBe(200);
    const log = await last();
    expect(log).toMatchObject({ userId: ana.id, entity: 'task', action: 'updated', entityLabel: 'Construcción' });
    expect(log.changes).toContainEqual({ field: 'status', from: 'TODO', to: 'IN_PROGRESS' });
  });

  it('un campo no vigilado aparece sin valores', async () => {
    await ctx.as(pm).patch(`/api/tasks/${task.id}`, { description: '<p>Nueva</p>', version: 1 });
    expect(await last()).toMatchObject({ action: 'updated', changes: [{ field: 'description' }] });
  });

  it('los asignados se guardan como nombres', async () => {
    const res = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [ana.id, luis.id] });
    expect(res.statusCode).toBe(200);
    expect((await last()).changes).toContainEqual({ field: 'assignees', from: ['Ana'], to: ['Ana', 'Luis'] });
  });

  it('borrar una tarea con pasos y comentarios deja un solo registro', async () => {
    await ctx.makeStep(task.id);
    await ctx.prisma.taskComment.create({ data: { taskId: task.id, authorId: ana.id, body: 'Hola' } });
    const before = (await logs()).length;
    expect((await ctx.as(pm).delete(`/api/tasks/${task.id}`)).statusCode).toBe(200);
    const after = await logs();
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatchObject({ entity: 'task', action: 'deleted', entityLabel: 'Construcción', projectId: project.id });
  });

  it('pasos y comentarios', async () => {
    const created = await ctx.as(pm).post(`/api/tasks/${task.id}/steps`, { title: 'Base' });
    expect(created.statusCode).toBe(201);
    expect(await last()).toMatchObject({ entity: 'step', action: 'created', entityLabel: 'Construcción · Base' });
    await ctx.as(ana).patch(`/api/tasks/${task.id}/steps/${created.json().id}`, { done: true });
    expect((await last()).changes).toContainEqual({ field: 'done', from: false, to: true });
    expect((await last()).changes).toContainEqual({ field: 'completedById', from: null, to: 'Ana' });
    await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'Avance listo' });
    expect(await last()).toMatchObject({ entity: 'comment', action: 'commented', entityLabel: 'Construcción', userId: ana.id });
  });

  it('proyecto: cambiar la fecha de fin y crear uno nuevo', async () => {
    await ctx.as(pm).patch(`/api/projects/${project.id}`, { endDate: '2026-12-31' });
    expect((await last()).changes).toContainEqual({ field: 'endDate', from: null, to: '2026-12-31' });
    const res = await ctx.as(pm).post('/api/projects', { name: 'Nuevo' });
    expect(res.statusCode).toBe(201);
    expect(await last()).toMatchObject({ projectId: res.json().id, entity: 'project', action: 'created', entityLabel: 'Nuevo' });
  });

  it('no registra respuestas con error', async () => {
    const before = (await logs()).length;
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: '' })).statusCode).toBe(400);
    expect((await ctx.as(olga).patch(`/api/tasks/${task.id}/progress`, { status: 'DONE' })).statusCode).toBe(403);
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    expect((await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'X', version: 1 })).statusCode).toBe(409);
    expect(await logs()).toHaveLength(before);
  });

  it('si no se puede registrar, la escritura responde igual', async () => {
    await ctx.prisma.$executeRawUnsafe('DROP TABLE "ActivityLog"');
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Obra', version: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Obra');
  });
});
