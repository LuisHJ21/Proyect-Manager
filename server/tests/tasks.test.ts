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

  it('colaborador miembro solo recibe las tareas asignadas', async () => {
    await ctx.makeTask(project.id, { assignees: [beto] });
    expect((await ctx.as(ana).get(`/api/projects/${project.id}/tasks`)).json()).toHaveLength(0);
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

  it('un comentario de más de 5 000 caracteres responde 400', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana] });
    const res = await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'a'.repeat(5001) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.body).toBe('Máximo 5 000 caracteres');
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

  describe('versión de la tarea', () => {
    const conflict = 'Otra persona guardó cambios en este registro mientras editabas';
    const edit = (id: string, body: object) => ctx.as(pm).patch(`/api/tasks/${id}`, body);
    const versionOf = async (id: string) => (await ctx.prisma.task.findUniqueOrThrow({ where: { id } })).version;

    it('editar con la versión actual la sube en 1', async () => {
      const task = await ctx.makeTask(project.id);
      const res = await edit(task.id, { title: 'Nuevo', version: 1 });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ title: 'Nuevo', version: 2 });
    });

    it('versión vieja responde 409 edit_conflict sin cambios', async () => {
      const task = await ctx.makeTask(project.id, { title: 'Original' });
      await edit(task.id, { title: 'Primero', version: 1 });
      const res = await edit(task.id, { title: 'Segundo', assigneeIds: [ana.id], version: 1 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'edit_conflict', message: conflict });
      const row = await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { assignees: true } });
      expect(row).toMatchObject({ title: 'Primero', version: 2 });
      expect(row.assignees).toEqual([]);
    });

    it('sin versión responde 400 en el campo version', async () => {
      const task = await ctx.makeTask(project.id);
      const res = await edit(task.id, { title: 'X' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.version).toBe('Recarga la página para editar este registro');
    });

    it('el avance y los pasos no cambian la versión', async () => {
      const task = await ctx.makeTask(project.id, { assignees: [ana] });
      expect((await ctx.as(ana).patch(progressUrl(task.id), { status: 'IN_PROGRESS', progress: 40 })).statusCode).toBe(200);
      const step = await ctx.as(pm).post(`/api/tasks/${task.id}/steps`, { title: 'Paso' });
      expect(step.statusCode).toBe(201);
      expect((await ctx.as(ana).patch(`/api/tasks/${task.id}/steps/${step.json().id}`, { done: true })).statusCode).toBe(200);
      expect(await versionOf(task.id)).toBe(1);
      expect((await edit(task.id, { title: 'Editada', version: 1 })).statusCode).toBe(200);
    });

    it('cambiar responsables sube la versión', async () => {
      const task = await ctx.makeTask(project.id);
      expect((await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [ana.id] })).json().version).toBe(2);
      expect((await edit(task.id, { title: 'X', version: 1 })).statusCode).toBe(409);
    });

    it('dos guardados en paralelo con la misma versión: uno 200 y otro 409', async () => {
      const task = await ctx.makeTask(project.id);
      const codes = (await Promise.all([edit(task.id, { title: 'A', version: 1 }), edit(task.id, { title: 'B', version: 1 })])).map((r) => r.statusCode);
      expect(codes.sort()).toEqual([200, 409]);
      expect(await versionOf(task.id)).toBe(2);
    });
  });
});
