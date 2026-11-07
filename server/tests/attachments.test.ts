import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type HttpClient, type TestCtx } from './helpers/testApp';

const MB = 1024 * 1024;

function multipart(filename: string, mime: string, content: Buffer | string) {
  const boundary = '----prueba';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '%22')}"\r\nContent-Type: ${mime}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('anexos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let project: Project;
  let task: Task;

  const upload = (client: HttpClient, url: string, filename = 'informe.pdf', mime = 'application/pdf', content: Buffer | string = 'pdf') => {
    const { payload, headers } = multipart(filename, mime, content);
    return client.post(url, payload, headers);
  };
  const taskUrl = () => `/api/tasks/${task.id}/attachments`;
  const projectUrl = () => `/api/projects/${project.id}/attachments`;
  const stored = () => {
    const dir = join(ctx.dataDir, 'uploads');
    return existsSync(dir) ? readdirSync(dir) : [];
  };

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana, beto] });
    task = await ctx.makeTask(project.id, { assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('asignado sube a su tarea; colaborador no asignado recibe 403', async () => {
    const ok = await upload(ctx.as(ana), taskUrl());
    expect(ok.statusCode).toBe(201);
    expect(ok.json().originalName).toBe('informe.pdf');
    expect(ok.json().uploadedBy.name).toBe('Ana');
    expect((await upload(ctx.as(beto), taskUrl())).statusCode).toBe(403);
    expect(stored()).toHaveLength(1);
  });

  it('colaborador recibe 403 al subir al proyecto; el PM puede', async () => {
    expect((await upload(ctx.as(ana), projectUrl())).statusCode).toBe(403);
    expect((await upload(ctx.as(pm), projectUrl())).statusCode).toBe(201);
  });

  it('las listas separan anexos de proyecto y de tarea', async () => {
    await upload(ctx.as(pm), projectUrl(), 'proyecto.pdf');
    await upload(ctx.as(pm), taskUrl(), 'tarea.pdf');
    const names = async (url: string) => (await ctx.as(beto).get(url)).json().map((a: { originalName: string }) => a.originalName);
    expect(await names(projectUrl())).toEqual(['proyecto.pdf']);
    expect(await names(taskUrl())).toEqual(['tarea.pdf']);
  });

  it('el miembro descarga el contenido; sin sesión responde 401 y sin ser miembro 404', async () => {
    const id = (await upload(ctx.as(pm), projectUrl(), 'a.pdf', 'application/pdf', 'contenido')).json().id;
    const url = `/api/attachments/${id}/download`;
    const res = await ctx.as(beto).get(url);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('contenido');
    expect((await ctx.anon.get(url)).statusCode).toBe(401);
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).get(url)).statusCode).toBe(404);
  });

  it('rechaza .exe con 415 y no deja archivo en disco', async () => {
    const res = await upload(ctx.as(pm), projectUrl(), 'virus.exe', 'application/octet-stream');
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('file_type_not_allowed');
    expect(stored()).toHaveLength(0);
  });

  it('rechaza una extensión válida con un tipo declarado incompatible', async () => {
    expect((await upload(ctx.as(pm), projectUrl(), 'a.pdf', 'text/html')).statusCode).toBe(415);
  });

  it('rechaza 25 MB + 1 byte con 413 y sin residuos', async () => {
    const res = await upload(ctx.as(pm), projectUrl(), 'a.pdf', 'application/pdf', Buffer.alloc(25 * MB + 1));
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('file_too_large');
    expect(stored()).toHaveLength(0);
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('acepta exactamente 25 MB', async () => {
    const res = await upload(ctx.as(pm), projectUrl(), 'a.pdf', 'application/pdf', Buffer.alloc(25 * MB));
    expect(res.statusCode).toBe(201);
    expect(res.json().size).toBe(25 * MB);
  });

  it.each([
    ['datos.csv', 'application/vnd.ms-excel'],
    ['datos.csv', 'text/csv'],
    ['datos.zip', 'application/x-zip-compressed'],
    ['carta.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['foto.JPG', 'image/jpeg'],
    ['carta.docx', 'application/octet-stream'],
  ])('acepta %s como %s', async (name, mime) => {
    expect((await upload(ctx.as(pm), projectUrl(), name, mime)).statusCode).toBe(201);
  });

  it('nombre con acentos, comillas y ruta se conserva y no sale de uploads', async () => {
    const up = (await upload(ctx.as(pm), projectUrl(), '../../informe "final" ñ.pdf')).json();
    const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: up.id } });
    expect(row.storedName).toMatch(/^[0-9a-f-]{36}$/);
    expect(stored()).toEqual([row.storedName]);
    expect(up.originalName).toBe('informe "final" ñ.pdf');

    const res = await ctx.as(pm).get(`/api/attachments/${up.id}/download`);
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toMatch(/^attachment;/);
    expect(disposition).toContain("filename*=UTF-8''informe%20%22final%22%20%C3%B1.pdf");
    expect(disposition).not.toMatch(/filename="[^"]*"[^;]/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toContain('application/octet-stream');
  });

  it('si falla el registro se borra el archivo', async () => {
    const spy = vi.spyOn(ctx.prisma.attachment, 'create').mockRejectedValueOnce(new Error('fallo de base de datos'));
    const res = await upload(ctx.as(pm), projectUrl());
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(stored()).toHaveLength(0);
  });

  it('solicitud sin archivo responde 400', async () => {
    const boundary = '----prueba';
    const res = await ctx.as(pm).post(projectUrl(), Buffer.from(`--${boundary}--\r\n`), {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('colaborador elimina solo lo que subió; PM elimina todo', async () => {
    const mine = (await upload(ctx.as(ana), taskUrl())).json().id;
    const pmFile = (await upload(ctx.as(pm), taskUrl())).json().id;
    expect((await ctx.as(ana).delete(`/api/attachments/${pmFile}`)).statusCode).toBe(403);
    expect((await ctx.as(beto).delete(`/api/attachments/${mine}`)).statusCode).toBe(403);
    expect((await ctx.as(ana).delete(`/api/attachments/${mine}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).delete(`/api/attachments/${pmFile}`)).statusCode).toBe(200);
    expect(stored()).toHaveLength(0);
  });

  it('archivo ausente en disco responde 404 attachment_file_missing, sin caída', async () => {
    const up = (await upload(ctx.as(pm), projectUrl())).json();
    rmSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    const res = await ctx.as(pm).get(`/api/attachments/${up.id}/download`);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('attachment_file_missing');
    expect((await ctx.as(pm).delete(`/api/attachments/${up.id}`)).statusCode).toBe(200);
  });
});
