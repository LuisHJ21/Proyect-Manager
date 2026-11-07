import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('usuarios con proyectos y tareas', () => {
  let ctx: TestCtx;
  let pm: User;
  let c: User;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    c = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos' });
  });
  afterEach(() => ctx.close());

  it('users incluye projects con projectRole, openTasks y overdueTasks, sin passwordHash', async () => {
    const p = await ctx.makeProject({ name: 'Portal', members: [c] });
    await ctx.prisma.projectMember.updateMany({ where: { projectId: p.id, userId: c.id }, data: { projectRole: 'Diseño' } });
    await ctx.makeTask(p.id, { assignees: [c], dueDate: '2026-11-01' });
    await ctx.makeTask(p.id, { assignees: [c] });
    await ctx.makeTask(p.id, { assignees: [c], status: 'DONE' });
    const res = await ctx.as(pm).get('/api/users');
    expect(res.body).not.toContain('passwordHash');
    const carlos = res.json().find((u: { id: string }) => u.id === c.id);
    expect(carlos.projects).toEqual([{ id: p.id, name: 'Portal', projectRole: 'Diseño' }]);
    expect(carlos.openTasks).toBe(2);
    expect(carlos.overdueTasks).toBe(1);
    const paula = res.json().find((u: { id: string }) => u.id === pm.id);
    expect(paula).toMatchObject({ projects: [], openTasks: 0, overdueTasks: 0 });
  });

  it('users/:id/tasks: solo abiertas, por fecha con vacías al final', async () => {
    const p = await ctx.makeProject({ name: 'Portal', members: [c] });
    await ctx.makeTask(p.id, { title: 'Sin fecha', assignees: [c] });
    await ctx.makeTask(p.id, { title: 'Tarde', assignees: [c], dueDate: '2026-12-01' });
    await ctx.makeTask(p.id, { title: 'Pronto', assignees: [c], dueDate: '2026-11-10' });
    await ctx.makeTask(p.id, { title: 'Hecha', assignees: [c], status: 'DONE', dueDate: '2026-11-01' });
    const list = (await ctx.as(pm).get(`/api/users/${c.id}/tasks`)).json();
    expect(list.map((t: { title: string }) => t.title)).toEqual(['Pronto', 'Tarde', 'Sin fecha']);
    expect(list[0]).toMatchObject({ projectId: p.id, projectName: 'Portal', status: 'TODO', dueDate: '2026-11-10' });
  });

  it('users/:id/tasks: 403 para colaborador y 404 si no existe', async () => {
    expect((await ctx.as(c).get(`/api/users/${c.id}/tasks`)).statusCode).toBe(403);
    expect((await ctx.as(pm).get('/api/users/nope/tasks')).statusCode).toBe(404);
  });
});
