import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('rutas de avisos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;

  const make = (user: User, data: Partial<{ title: string; createdAt: Date; readAt: Date; projectId: string }> = {}) =>
    ctx.prisma.notification.create({
      data: { userId: user.id, projectId: project.id, kind: 'TASK_ASSIGNED', entityId: 't1', title: 'Diseño', ...data },
    });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ name: 'Portal web', members: [ana, luis] });
  });
  afterEach(() => ctx.close());

  it('lista solo los avisos propios, del más reciente al más antiguo', async () => {
    await make(ana, { title: 'Vieja', createdAt: new Date('2026-11-01T10:00:00Z') });
    await make(ana, { title: 'Nueva', createdAt: new Date('2026-11-02T10:00:00Z') });
    await make(luis, { title: 'De Luis' });
    const res = await ctx.as(ana).get('/api/notifications');
    expect(res.statusCode).toBe(200);
    const { items, nextCursor } = res.json();
    expect(items.map((n: { title: string }) => n.title)).toEqual(['Nueva', 'Vieja']);
    expect(items[0]).toMatchObject({ kind: 'TASK_ASSIGNED', projectId: project.id, projectName: 'Portal web', entityId: 't1', actorName: '', detail: '', readAt: null });
    expect(nextCursor).toBeNull();
  });

  it('sin sesión responde 401', async () => {
    expect((await ctx.anon.get('/api/notifications')).statusCode).toBe(401);
    expect((await ctx.anon.get('/api/notifications/unread-count')).statusCode).toBe(401);
  });

  it('pagina de 30 en 30 sin repetir con createdAt iguales', async () => {
    const at = new Date('2026-11-03T10:00:00Z');
    for (let i = 0; i < 31; i += 1) await make(ana, { title: `Aviso ${i}`, createdAt: at });
    const first = (await ctx.as(ana).get('/api/notifications')).json();
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (await ctx.as(ana).get(`/api/notifications?before=${first.nextCursor}`)).json();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((n: { id: string }) => n.id)).size).toBe(31);
  });

  it('la cuenta solo incluye los no leídos', async () => {
    await make(ana);
    await make(ana);
    await make(ana, { readAt: new Date() });
    expect((await ctx.as(ana).get('/api/notifications/unread-count')).json()).toEqual({ count: 2 });
  });

  it('marcar uno lo marca; el de otro usuario responde 404 y no cambia', async () => {
    const mine = await make(ana);
    const other = await make(luis);
    expect((await ctx.as(ana).post(`/api/notifications/${mine.id}/read`, {})).statusCode).toBe(200);
    expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    const res = await ctx.as(ana).post(`/api/notifications/${other.id}/read`, {});
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('Aviso no encontrado');
    expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).readAt).toBeNull();
  });

  it('marcar todos solo toca los propios', async () => {
    await make(ana);
    await make(ana);
    await make(luis);
    expect((await ctx.as(ana).post('/api/notifications/read-all', {})).statusCode).toBe(200);
    expect(await ctx.prisma.notification.count({ where: { userId: ana.id, readAt: null } })).toBe(0);
    expect(await ctx.prisma.notification.count({ where: { userId: luis.id, readAt: null } })).toBe(1);
  });

  it('quitado del proyecto, sus avisos de ese proyecto no aparecen', async () => {
    await make(ana);
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`)).statusCode).toBe(200);
    expect((await ctx.as(ana).get('/api/notifications')).json().items).toEqual([]);
    expect((await ctx.as(ana).get('/api/notifications/unread-count')).json()).toEqual({ count: 0 });
  });

  it('el PM ve sus avisos de proyectos donde no es miembro', async () => {
    await make(pm);
    expect((await ctx.as(pm).get('/api/notifications/unread-count')).json()).toEqual({ count: 1 });
  });
});
