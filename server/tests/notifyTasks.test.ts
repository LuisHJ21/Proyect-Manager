import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('avisos de tareas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const of = (user: User) => ctx.prisma.notification.findMany({ where: { userId: user.id } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    // El PM es miembro para poder asignarse tareas (C2).
    project = await ctx.makeProject({ members: [pm, ana, luis] });
  });
  afterEach(() => ctx.close());

  it('crear una tarea con responsables avisa a cada uno', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Diseño', assigneeIds: [ana.id, luis.id] });
    expect(res.statusCode).toBe(201);
    for (const user of [ana, luis]) {
      expect(await of(user)).toEqual([expect.objectContaining({ kind: 'TASK_ASSIGNED', title: 'Diseño', projectId: project.id, entityId: res.json().id })]);
    }
    expect(await of(pm)).toEqual([]);
  });

  it('editar responsables solo avisa a los nuevos', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana] });
    expect((await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [ana.id, luis.id] })).statusCode).toBe(200);
    expect(await of(luis)).toHaveLength(1);
    expect(await of(ana)).toHaveLength(0);
  });

  it('repetir los mismos responsables no avisa', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana] });
    expect((await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [ana.id] })).statusCode).toBe(200);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('cambiar responsables con la ruta de responsables avisa al nuevo', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana] });
    expect((await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [luis.id] })).statusCode).toBe(200);
    expect(await of(luis)).toEqual([expect.objectContaining({ kind: 'TASK_ASSIGNED', title: 'Diseño' })]);
    expect(await of(ana)).toHaveLength(0);
  });

  it('el PM que se asigna su tarea no se avisa', async () => {
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Diseño', assigneeIds: [pm.id] })).statusCode).toBe(201);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('un comentario avisa a los demás responsables', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana, luis] });
    expect((await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'Secreto del comentario' })).statusCode).toBe(201);
    const [notice] = await of(luis);
    expect(notice).toMatchObject({ kind: 'TASK_COMMENTED', title: 'Diseño', actorName: 'Ana', entityId: task.id });
    expect(JSON.stringify(notice)).not.toContain('Secreto');
    expect(await of(ana)).toHaveLength(0);
  });

  it('el comentario del PM avisa a todos los responsables', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana, luis] });
    expect((await ctx.as(pm).post(`/api/tasks/${task.id}/comments`, { body: 'Hola' })).statusCode).toBe(201);
    expect(await of(ana)).toHaveLength(1);
    expect(await of(luis)).toHaveLength(1);
  });
});

describe('un fallo de los avisos no cambia la respuesta', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    return ctx.close();
  });

  it('comentar responde 201 aunque falle la búsqueda de destinatarios', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = ctx.prisma.taskAssignee.findMany.bind(ctx.prisma.taskAssignee);
    // Solo falla la búsqueda que se hace después de guardar el comentario.
    vi.spyOn(ctx.prisma.taskAssignee, 'findMany').mockImplementation(((args: { select?: { userId?: boolean } }) =>
      args?.select?.userId ? Promise.reject(new Error('Base caída')) : original(args as never)) as never);
    const res = await ctx.as(pm).post(`/api/tasks/${task.id}/comments`, { body: 'Hola' });
    expect(res.statusCode).toBe(201);
    expect(await ctx.prisma.taskComment.count()).toBe(1);
  });

  it('crear tarea e incidente responden 201 aunque falle la creación de avisos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ctx.prisma.notification, 'createMany').mockRejectedValue(new Error('Base caída'));
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Diseño', assigneeIds: [ana.id] })).statusCode).toBe(201);
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/incidents`, { title: 'Caída', ownerId: ana.id })).statusCode).toBe(201);
  });
});
