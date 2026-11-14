import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '../src/notifications';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('notify', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const base = () => ({ kind: 'TASK_ASSIGNED' as const, projectId: project.id, entityId: 't1', title: 'Diseño' });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana, luis] });
  });
  afterEach(() => ctx.close());

  it('crea un aviso por destinatario', async () => {
    expect(await notify(ctx.prisma, { ...base(), userIds: [ana.id, luis.id] })).toBe(2);
    const rows = await ctx.prisma.notification.findMany({ orderBy: { userId: 'asc' } });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ kind: 'TASK_ASSIGNED', title: 'Diseño', projectId: project.id, entityId: 't1', readAt: null });
  });

  it('no avisa al actor ni a usuarios inactivos', async () => {
    const inactive = await ctx.makeUser({ role: 'COLLABORATOR', active: false });
    await notify(ctx.prisma, { ...base(), userIds: [pm.id, inactive.id, ana.id], actorId: pm.id });
    const rows = await ctx.prisma.notification.findMany();
    expect(rows.map((r) => r.userId)).toEqual([ana.id]);
  });

  it('quita duplicados de userIds', async () => {
    await notify(ctx.prisma, { ...base(), userIds: [ana.id, ana.id] });
    expect(await ctx.prisma.notification.count()).toBe(1);
  });

  it('con la misma dedupeKey no repite', async () => {
    const input = { ...base(), kind: 'TASK_DUE_SOON' as const, userIds: [ana.id], dedupeKey: 'TASK_DUE_SOON:t1:2026-11-07' };
    expect(await notify(ctx.prisma, input)).toBe(1);
    expect(await notify(ctx.prisma, input)).toBe(0);
    expect(await ctx.prisma.notification.count()).toBe(1);
  });

  it('si falla no lanza', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await notify(ctx.prisma, { ...base(), projectId: 'no-existe', userIds: [ana.id] })).toBe(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
