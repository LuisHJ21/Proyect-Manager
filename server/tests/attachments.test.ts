import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_FILE_BYTES } from '@pm/shared';
import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, uploadFile, type HttpClient, type TestCtx } from './helpers/testApp';

const MB = 1024 * 1024;

describe('anexos', () => {
  let ctx: TestCtx;
  let pm: HttpClient;
  let pmUser: User;
  let ana: User;
  let beto: User;
  let project: Project;
  let task: Task;

  const taskUrl = () => `/api/tasks/${task.id}/attachments`;
  const projectUrl = () => `/api/projects/${project.id}/attachments`;
  const request = (client: HttpClient, url: string, filename = 'informe.pdf', mimeType = 'application/pdf', size = 3) =>
    client.post(url, { filename, mimeType, size });
  const send = (client: HttpClient, url: string, name = 'informe.pdf', content: Buffer | string = 'pdf', type = 'application/pdf') =>
    uploadFile(client, url, { name, type, content: Buffer.from(content) });
  const stored = () => {
    const dir = join(ctx.dataDir, 'uploads');
    return existsSync(dir) ? readdirSync(dir) : [];
  };
  const storedNameOf = async (id: string) => (await ctx.prisma.attachment.findUniqueOrThrow({ where: { id } })).storedName;

  beforeEach(async () => {
    ctx = await createTestApp();
    pmUser = await ctx.makeUser({ role: 'PM' });
    pm = ctx.as(pmUser);
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana, beto] });
    task = await ctx.makeTask(project.id, { assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('asignado sube a su tarea; colaborador no asignado recibe 403', async () => {
    const ok = await send(ctx.as(ana), taskUrl());
    expect(ok).toMatchObject({ originalName: 'informe.pdf', uploadedBy: { name: 'Ana' } });
    expect((await request(ctx.as(beto), taskUrl())).statusCode).toBe(403);
    expect(stored()).toHaveLength(1);
  });

  it('colaborador recibe 403 al subir al proyecto; el PM puede', async () => {
    expect((await request(ctx.as(ana), projectUrl())).statusCode).toBe(403);
    const res = await request(pm, projectUrl());
    expect(res.statusCode).toBe(201);
    expect(res.json().upload).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } });
    expect(res.json().attachment).not.toHaveProperty('storedName');
  });

  it('las listas separan anexos de proyecto y de tarea', async () => {
    await send(pm, projectUrl(), 'proyecto.pdf');
    await send(pm, taskUrl(), 'tarea.pdf');
    const names = async (url: string) => (await ctx.as(beto).get(url)).json().map((a: { originalName: string }) => a.originalName);
    expect(await names(projectUrl())).toEqual(['proyecto.pdf']);
    expect(await names(taskUrl())).toEqual(['tarea.pdf']);
  });

  it('el miembro descarga el contenido; sin sesión responde 401 y sin ser miembro 404', async () => {
    const { id } = await send(pm, projectUrl(), 'a.pdf', 'contenido');
    const url = `/api/attachments/${id}/download`;
    const res = await ctx.as(beto).get(url);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('contenido');
    expect((await ctx.anon.get(url)).statusCode).toBe(401);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(url)).statusCode).toBe(404);
  });

  it('rechaza .exe con 415 y no crea anexo', async () => {
    const res = await request(pm, projectUrl(), 'virus.exe', 'application/octet-stream');
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('file_type_not_allowed');
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('rechaza una extensión válida con un tipo declarado incompatible', async () => {
    expect((await request(pm, projectUrl(), 'a.pdf', 'text/html')).statusCode).toBe(415);
  });

  it('rechaza declarar 25 MB + 1 byte, sin crear anexo', async () => {
    const res = await request(pm, projectUrl(), 'a.pdf', 'application/pdf', 25 * MB + 1);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.size).toBe('El archivo supera el límite de 25 MB');
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('la subida local de 25 MB + 1 byte responde 413 y no deja archivo', async () => {
    const { attachment, upload } = (await request(pm, projectUrl(), 'a.pdf', 'application/pdf', 25 * MB)).json();
    const res = await pm.put(upload.url, Buffer.alloc(25 * MB + 1), upload.headers);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('file_too_large');
    expect(stored()).toHaveLength(0);
    expect((await pm.post(`/api/attachments/${attachment.id}/complete`)).statusCode).toBe(409);
  });

  it('acepta exactamente 25 MB', async () => {
    const done = await send(pm, projectUrl(), 'a.pdf', Buffer.alloc(25 * MB));
    expect(done).toMatchObject({ size: 25 * MB });
  });

  it.each([
    ['datos.csv', 'application/vnd.ms-excel'],
    ['datos.csv', 'text/csv'],
    ['datos.zip', 'application/x-zip-compressed'],
    ['carta.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['foto.JPG', 'image/jpeg'],
    ['carta.docx', 'application/octet-stream'],
  ])('acepta %s como %s', async (name, mime) => {
    expect((await request(pm, projectUrl(), name, mime)).statusCode).toBe(201);
  });

  it('nombre con acentos, comillas y ruta se conserva y no sale de uploads', async () => {
    const up = await send(pm, projectUrl(), '../../informe "final" ñ.pdf');
    const storedName = await storedNameOf(up.id);
    expect(storedName).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored()).toEqual([storedName]);
    expect(up.originalName).toBe('informe "final" ñ.pdf');

    const res = await pm.get(`/api/attachments/${up.id}/download`);
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toContain("filename*=UTF-8''informe%20%22final%22%20%C3%B1.pdf");
    expect(disposition).not.toMatch(/filename="[^"]*"[^;]/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toContain('application/octet-stream');
  });

  it('si falla el registro no queda anexo ni archivo', async () => {
    const spy = vi.spyOn(ctx.prisma.attachment, 'create').mockRejectedValueOnce(new Error('fallo de base de datos'));
    const res = await request(pm, projectUrl());
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(stored()).toHaveLength(0);
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('solicitud sin datos del archivo responde 400', async () => {
    const res = await pm.post(projectUrl(), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.filename).toBeTruthy();
  });

  it('colaborador elimina solo lo que subió; PM elimina todo', async () => {
    const { id: mine } = await send(ctx.as(ana), taskUrl());
    const { id: pmFile } = await send(pm, taskUrl());
    expect((await ctx.as(ana).delete(`/api/attachments/${pmFile}`)).statusCode).toBe(403);
    expect((await ctx.as(beto).delete(`/api/attachments/${mine}`)).statusCode).toBe(403);
    expect((await ctx.as(ana).delete(`/api/attachments/${mine}`)).statusCode).toBe(200);
    expect((await pm.delete(`/api/attachments/${pmFile}`)).statusCode).toBe(200);
    expect(stored()).toHaveLength(0);
  });

  it('archivo ausente en disco responde 404 attachment_file_missing, sin caída', async () => {
    const up = await send(pm, projectUrl());
    rmSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    const res = await pm.get(`/api/attachments/${up.id}/download`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('attachment_file_missing');
    expect((await pm.delete(`/api/attachments/${up.id}`)).statusCode).toBe(200);
  });

  it('un tipo vacío se guarda y se envía como application/octet-stream', async () => {
    const res = await request(pm, projectUrl(), 'datos.csv', '', 3);
    expect(res.statusCode).toBe(201);
    expect(res.json().attachment.mimeType).toBe('application/octet-stream');
    expect(res.json().upload.headers['content-type']).toBe('application/octet-stream');
  });

  it('si falla el borrado del archivo, el anexo se elimina igual y responde 200', async () => {
    const up = await send(pm, projectUrl());
    const storedName = await storedNameOf(up.id);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ctx.files, 'remove').mockRejectedValueOnce(new Error('Storage caído'));
    expect((await pm.delete(`/api/attachments/${up.id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.attachment.count()).toBe(0);
    expect(error).toHaveBeenCalled();
    expect(stored()).toContain(storedName);
    const { runDailyJobs } = await import('../src/jobs/daily');
    await runDailyJobs(ctx.deps);
    expect(stored()).not.toContain(storedName);
    error.mockRestore();
  });

  it('si la limpieza diaria borra el anexo mientras se confirma, responde 404', async () => {
    const res = await request(pm, projectUrl());
    const { attachment, upload } = res.json();
    await pm.put(upload.url, Buffer.from('pdf'), upload.headers);
    const stat = ctx.files.stat.bind(ctx.files);
    vi.spyOn(ctx.files, 'stat').mockImplementationOnce(async (name) => {
      const found = await stat(name);
      await ctx.prisma.attachment.delete({ where: { id: attachment.id } });
      return found;
    });
    expect((await pm.post(`/api/attachments/${attachment.id}/complete`)).statusCode).toBe(404);
  });

  it('no confirma un anexo que nunca se subió', async () => {
    const res = await pm.post(`/api/projects/${project.id}/attachments`, { filename: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    const done = await pm.post(`/api/attachments/${res.json().attachment.id}/complete`);
    expect(done.statusCode).toBe(409);
    expect(done.json().error.code).toBe('upload_missing');
    expect((await pm.get(`/api/projects/${project.id}/attachments`)).json()).toEqual([]);
  });

  it('rechaza y borra un archivo mayor al límite aunque se declarara pequeño', async () => {
    const res = await pm.post(`/api/projects/${project.id}/attachments`, { filename: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    const { attachment } = res.json();
    const { storedName } = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    await ctx.files.put(storedName, Buffer.alloc(MAX_FILE_BYTES + 1));
    const done = await pm.post(`/api/attachments/${attachment.id}/complete`);
    expect(done.statusCode).toBe(413);
    expect(await ctx.prisma.attachment.count()).toBe(0);
    expect(stored()).toHaveLength(0);
  });

  it('confirmar guarda el tamaño real del archivo', async () => {
    const { attachment, upload } = (await request(pm, projectUrl(), 'a.pdf', 'application/pdf', 100)).json();
    await pm.put(upload.url, Buffer.from('12345'), upload.headers);
    const done = await pm.post(`/api/attachments/${attachment.id}/complete`);
    expect(done.statusCode).toBe(200);
    expect(done.json().size).toBe(5);
  });

  it('un anexo pendiente no aparece en la lista ni se descarga', async () => {
    const { attachment, upload } = (await request(pm, projectUrl())).json();
    await pm.put(upload.url, Buffer.from('pdf'), upload.headers);
    expect((await pm.get(projectUrl())).json()).toEqual([]);
    expect((await pm.get(`/api/attachments/${attachment.id}/download`)).statusCode).toBe(404);
  });

  it('un anexo pendiente no se puede usar como evidencia de un entregable', async () => {
    const { attachment } = (await request(pm, projectUrl())).json();
    const base = `/api/projects/${project.id}/deliverables`;
    const id = (await pm.post(base, { name: 'Portal', criteria: ['Funciona'] })).json().id;
    await pm.patch(`${base}/${id}`, { status: 'IN_REVIEW', version: 1 });
    const res = await pm.post(`${base}/${id}/reviews`, { reviewedOn: '2026-11-06', outcome: 'REJECTED', note: 'Falta', attachmentId: attachment.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.attachmentId).toBeTruthy();
  });

  it('solo quien lo subió puede confirmarlo', async () => {
    const { attachment, upload } = (await request(ctx.as(ana), taskUrl())).json();
    await ctx.as(ana).put(upload.url, Buffer.from('pdf'), upload.headers);
    const res = await pm.post(`/api/attachments/${attachment.id}/complete`);
    expect(res.statusCode).toBe(403);
  });

  it('solo quien solicitó la subida puede enviar el archivo', async () => {
    const { upload } = (await request(ctx.as(ana), taskUrl())).json();
    expect((await ctx.anon.put(upload.url, Buffer.from('pdf'), upload.headers)).statusCode).toBe(401);
    expect((await ctx.as(beto).put(upload.url, Buffer.from('pdf'), upload.headers)).statusCode).toBe(404);
    expect(stored()).toHaveLength(0);
  });

  it('no se puede confirmar en un proyecto cerrado', async () => {
    const { attachment, upload } = (await request(pm, projectUrl())).json();
    await pm.put(upload.url, Buffer.from('pdf'), upload.headers);
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const res = await pm.post(`/api/attachments/${attachment.id}/complete`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('project_closed');
  });
});
