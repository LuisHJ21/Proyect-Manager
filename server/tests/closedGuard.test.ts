import type { Attachment, Project, Task, User } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listRoutes } from '../src/http';
import { createTestApp, type TestCtx } from './helpers/testApp';

const EXCEPTIONS = [/^DELETE \/api\/projects\/:id$/, /^\w+ \/api\/projects\/:id\/lessons/, /^POST \/api\/projects\/:id\/reopen$/];

describe('guardia de solo lectura', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let task: Task;
  let attachment: Attachment;
  const setStatus = (status: string) => ctx.prisma.project.update({ where: { id: project.id }, data: { status } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ name: 'Portal', members: [ana] });
    task = await ctx.makeTask(project.id, { title: 'T', assignees: [ana] });
    await ctx.makeStep(task.id);
    mkdirSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    writeFileSync(join(ctx.dataDir, 'uploads', 'f-guard'), 'x');
    attachment = await ctx.prisma.attachment.create({
      data: { projectId: project.id, uploadedById: pm.id, originalName: 'a.pdf', storedName: 'f-guard', mimeType: 'application/pdf', size: 1 },
    });
    await setStatus('CLOSED');
  });
  afterEach(() => ctx.close());

  it('cobertura: todas las rutas de escritura de un proyecto cerrado responden 409', async () => {
    const prefixes: [string, () => string][] = [
      ['/api/projects/:id', () => project.id],
      ['/api/tasks/:id', () => task.id],
      ['/api/attachments/:id', () => attachment.id],
      ['/api/local-uploads/:storedName', () => attachment.storedName],
    ];
    const routes = listRoutes(ctx.app)
      .filter((r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method))
      .filter((r) => prefixes.some(([prefix]) => r.url === prefix || r.url.startsWith(`${prefix}/`)))
      .filter((r) => !EXCEPTIONS.some((re) => re.test(`${r.method} ${r.url}`)));
    expect(routes.length).toBeGreaterThanOrEqual(30);
    const failures: string[] = [];
    for (const route of routes) {
      const [, idOf] = prefixes.find(([prefix]) => route.url === prefix || route.url.startsWith(`${prefix}/`))!;
      const path = route.url.replace(/:\w+/, idOf()).replace(/:\w+/g, 'x');
      const res = await ctx.as(pm)[route.method.toLowerCase() as 'post'](path, {});
      if (res.statusCode !== 409 || res.json().error?.code !== 'project_closed') failures.push(`${route.method} ${route.url} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
    expect(routes.map((r) => `${r.method} ${r.url}`)).toEqual(
      expect.arrayContaining(['POST /api/attachments/:id/complete', 'PUT /api/local-uploads/:storedName', 'POST /api/projects/:id/change-requests/:crId/apply', 'POST /api/tasks/:id/move', 'PUT /api/projects/:id/budget-categories']),
    );
  });

  it('las excepciones siguen funcionando', async () => {
    expect((await ctx.as(ana).post(`/api/projects/${project.id}/lessons`, {})).statusCode).not.toBe(409);
    expect((await ctx.as(pm).post(`/api/projects/${project.id}/reopen`, { reason: 'Revisar' })).statusCode).not.toBe(409);
    await setStatus('CANCELLED');
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}`, { confirmName: 'Portal' })).statusCode).toBe(200);
  });

  it('sin acceso, la respuesta de siempre', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(outsider).patch(`/api/tasks/${task.id}`, { title: 'X', version: 1 })).statusCode).toBe(404);
    expect((await ctx.as(outsider).post(`/api/projects/${project.id}/tasks`, { title: 'X' })).statusCode).toBe(404);
    expect((await ctx.anon.patch(`/api/tasks/${task.id}`, { title: 'X', version: 1 })).statusCode).toBe(401);
    expect((await ctx.as(pm).patch('/api/tasks/no-existe', { title: 'X' })).statusCode).toBe(404);
  });

  it('un id codificado en la URL no se salta el guardia', async () => {
    const encode = (id: string) => `%${id.charCodeAt(0).toString(16)}${id.slice(1)}`;
    const viaProject = await ctx.as(pm).post(`/api/projects/${encode(project.id)}/tasks`, { title: 'Colada' });
    expect(viaProject.statusCode).toBe(409);
    const viaTask = await ctx.as(ana).patch(`/api/tasks/${encode(task.id)}/progress`, { progress: 50 });
    expect(viaTask.statusCode).toBe(409);
    expect(await ctx.prisma.task.count({ where: { projectId: project.id } })).toBe(1);
  });

  it('ascender a PM no toca las asignaciones, de proyectos cerrados ni abiertos', async () => {
    const open = await ctx.makeProject({ members: [ana] });
    const openTask = await ctx.makeTask(open.id, { title: 'Abierta', assignees: [ana] });
    expect((await ctx.as(pm).patch(`/api/users/${ana.id}`, { role: 'PM' })).statusCode).toBe(200);
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id, userId: ana.id } })).toBe(1);
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: openTask.id, userId: ana.id } })).toBe(1);
  });

  it('un proyecto abierto no se bloquea', async () => {
    await setStatus('EXECUTING');
    expect((await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Nuevo', version: 1 })).statusCode).toBe(200);
  });
});
