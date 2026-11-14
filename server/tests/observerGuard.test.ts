import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listRoutes } from '../src/http';
import { createTestApp, type TestCtx } from './helpers/testApp';

const PASSWORD = 'clave-del-observador';
const ALLOWED = ['POST /api/auth/logout', 'POST /api/auth/change-password', 'POST /api/setup', 'POST /api/auth/login'];

describe('guardia del observador', () => {
  let ctx: TestCtx;
  let observer: User;
  let ana: User;
  let project: Project;
  let task: Task;
  beforeEach(async () => {
    ctx = await createTestApp();
    await ctx.makeUser({ role: 'PM' });
    observer = await ctx.makeUser({ role: 'OBSERVER', password: PASSWORD });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [observer, ana] });
    task = await ctx.makeTask(project.id, { assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('cobertura: toda escritura del observador responde 403 observer_read_only', async () => {
    const routes = listRoutes(ctx.app)
      .filter((r) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method))
      .filter((r) => !ALLOWED.includes(`${r.method} ${r.url}`));
    expect(routes.length).toBeGreaterThanOrEqual(40);
    const failures: string[] = [];
    for (const route of routes) {
      const path = route.url
        .replace(/^\/api\/projects\/:id/, `/api/projects/${project.id}`)
        .replace(/^\/api\/tasks\/:id/, `/api/tasks/${task.id}`)
        .replace(/:\w+/g, 'x');
      const res = await ctx.as(observer)[route.method.toLowerCase() as 'post'](path, {});
      if (res.statusCode !== 403 || res.json().error?.code !== 'observer_read_only') failures.push(`${route.method} ${route.url} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it('el mensaje es el de la especificación', async () => {
    const res = await ctx.as(observer).post(`/api/projects/${project.id}/lessons`, {});
    expect(res.json().error.message).toBe('Tu perfil es de solo lectura');
  });

  it('el observador puede cerrar sesión y cambiar su contraseña', async () => {
    const changed = await ctx.as(observer).post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'otra-clave-larga' });
    expect(changed.statusCode).toBe(200);
    expect((await ctx.as(observer).post('/api/auth/logout')).statusCode).toBe(200);
  });

  it('el colaborador no se ve afectado', async () => {
    const res = await ctx.as(ana).post(`/api/tasks/${task.id}/comments`, { body: 'Avance listo' });
    expect(res.statusCode).toBe(201);
  });
});
