import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('tareas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    project = await ctx.makeProject({ members: [ana, beto] });
  });
  afterEach(() => ctx.close());

  const progressUrl = (id: string) => `/api/tasks/${id}/progress`;

  it('una tarea admite varios asignados y aparece en me/tasks de cada uno', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Diseño', assigneeIds: [ana.id, beto.id] });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignees.map((a: { name: string }) => a.name).sort()).toEqual(['Ana', 'Beto']);
    for (const user of [ana, beto]) {
      const mine = (await ctx.as(user).get('/api/me/tasks')).json();
      expect(mine.map((t: { title: string }) => t.title)).toEqual(['Diseño']);
    }
  });

  it('me/tasks incluye el nombre del proyecto y omite las de otros', async () => {
    await ctx.makeTask(project.id, { title: 'Ajena', assignees: [beto] });
    await ctx.makeTask(project.id, { title: 'Mía', assignees: [ana] });
    const mine = (await ctx.as(ana).get('/api/me/tasks')).json();
    expect(mine).toHaveLength(1);
    expect(mine[0].projectName).toBe(project.name);
  });

  it('rechaza asignar a quien no es miembro', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    const task = await ctx.makeTask(project.id);
    const res = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [ana.id, outsider.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.userIds).toBeTruthy();
  });

  it('PUT assignees reemplaza la lista', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const res = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [beto.id] });
    expect(res.json().assignees.map((a: { id: string }) => a.id)).toEqual([beto.id]);
  });

  it('una tarea puede quedar sin asignar', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Libre' });
    expect(res.json().assignees).toEqual([]);
  });

  it('el hito debe ser del mismo proyecto', async () => {
    const other = await ctx.makeProject();
    const m = await ctx.prisma.milestone.create({ data: { projectId: other.id, name: 'H', dueDate: '2026-12-01' } });
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', milestoneId: m.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.milestoneId).toBeTruthy();
  });

  it('rechaza startDate posterior a dueDate', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', startDate: '2026-12-02', dueDate: '2026-12-01' });
    expect(res.json().error.fields.startDate).toBeTruthy();
  });

  it('PATCH tasks/:id rechaza status y progress', async () => {
    const task = await ctx.makeTask(project.id);
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { status: 'DONE' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.status).toBeTruthy();
    const res2 = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { progress: 50 });
    expect(res2.json().error.fields.progress).toBeTruthy();
  });

  it('colaborador no puede crear, editar ni eliminar tareas', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const client = ctx.as(ana);
    expect((await client.post(`/api/projects/${project.id}/tasks`, { title: 'T' })).statusCode).toBe(403);
    expect((await client.patch(`/api/tasks/${task.id}`, { title: 'X' })).statusCode).toBe(403);
    expect((await client.delete(`/api/tasks/${task.id}`)).statusCode).toBe(403);
    expect((await client.put(`/api/tasks/${task.id}/assignees`, { userIds: [] })).statusCode).toBe(403);
  });

  it('asignado actualiza; colaborador no asignado recibe 403', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const ok = await ctx.as(ana).patch(progressUrl(task.id), { status: 'IN_PROGRESS', progress: 40 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().progress).toBe(40);
    expect((await ctx.as(beto).patch(progressUrl(task.id), { progress: 50 })).statusCode).toBe(403);
  });

  it('no miembro recibe 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    const task = await ctx.makeTask(project.id);
    expect((await ctx.as(outsider).get(`/api/tasks/${task.id}`)).statusCode).toBe(404);
    expect((await ctx.as(outsider).get(`/api/projects/${project.id}/tasks`)).statusCode).toBe(404);
  });

  it('colaborador miembro lee todas las tareas del proyecto', async () => {
    await ctx.makeTask(project.id, { assignees: [beto] });
    expect((await ctx.as(ana).get(`/api/projects/${project.id}/tasks`)).json()).toHaveLength(1);
  });

  it('marcar DONE fija progress=100', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const res = await ctx.as(ana).patch(progressUrl(task.id), { status: 'DONE', progress: 30 });
    expect(res.json().status).toBe('DONE');
    expect(res.json().progress).toBe(100);
  });

  it('rechaza progress fuera de 0 a 100', async () => {
    const task = await ctx.makeTask(project.id);
    for (const progress of [-1, 101, 1.5]) {
      const res = await ctx.as(pm).patch(progressUrl(task.id), { progress });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.progress).toBeTruthy();
    }
  });

  it('comentar requiere ser PM o asignado', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const url = `/api/tasks/${task.id}/comments`;
    expect((await ctx.as(ana).post(url, { body: 'Hola' })).statusCode).toBe(201);
    expect((await ctx.as(pm).post(url, { body: 'Bien' })).statusCode).toBe(201);
    expect((await ctx.as(beto).post(url, { body: 'No' })).statusCode).toBe(403);
    expect((await ctx.as(ana).post(url, { body: '  ' })).statusCode).toBe(400);
  });

  it('el detalle incluye comentarios con su autor; no existen PATCH ni DELETE de comentarios', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const created = await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'Hola' });
    const detail = (await ctx.as(beto).get(`/api/tasks/${task.id}`)).json();
    expect(detail.comments[0].body).toBe('Hola');
    expect(detail.comments[0].author.name).toBe('Ana');
    const url = `/api/tasks/${task.id}/comments/${created.json().id}`;
    expect((await ctx.as(pm).patch(url, { body: 'x' })).statusCode).toBe(404);
    expect((await ctx.as(pm).delete(url)).statusCode).toBe(404);
  });

  it('eliminar una tarea borra sus anexos del disco', async () => {
    const task = await ctx.makeTask(project.id);
    mkdirSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    const file = join(ctx.dataDir, 'uploads', 'archivo-t');
    writeFileSync(file, 'x');
    await ctx.prisma.attachment.create({
      data: { projectId: project.id, taskId: task.id, uploadedById: pm.id, originalName: 'a.pdf', storedName: 'archivo-t', mimeType: 'application/pdf', size: 1 },
    });
    expect((await ctx.as(pm).delete(`/api/tasks/${task.id}`)).statusCode).toBe(200);
    expect(existsSync(file)).toBe(false);
  });
});
