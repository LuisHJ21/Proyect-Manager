import { addDays } from '@pm/shared';
import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDailyJobs } from '../src/jobs/daily';
import { createTestApp, type TestCtx } from './helpers/testApp';

const DAY = 86_400_000;

describe('tarea diaria: avisos de vencimiento', () => {
  let ctx: TestCtx;
  let ana: User;
  let project: Project;
  let today: string;
  const now = new Date('2026-11-06T10:00:00Z');
  const of = (user: User) => ctx.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(now.toISOString());
    today = ctx.deps.today();
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('avisa de la tarea que vence mañana', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana], dueDate: addDays(today, 1) });
    const result = await runDailyJobs(ctx.deps);
    expect(result.dueSoon).toBe(1);
    expect(await of(ana)).toEqual([expect.objectContaining({ kind: 'TASK_DUE_SOON', title: 'Diseño', entityId: task.id, projectId: project.id })]);
  });

  it('avisa de la tarea que venció ayer', async () => {
    await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana], dueDate: addDays(today, -1) });
    const result = await runDailyJobs(ctx.deps);
    expect(result.overdue).toBe(1);
    expect(await of(ana)).toEqual([expect.objectContaining({ kind: 'TASK_OVERDUE' })]);
  });

  it('no avisa de tareas hechas, sin fecha o vencidas hace más de un día', async () => {
    await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, 1), status: 'DONE' });
    await ctx.makeTask(project.id, { assignees: [ana] });
    await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, -5) });
    const result = await runDailyJobs(ctx.deps);
    expect(result).toMatchObject({ dueSoon: 0, overdue: 0 });
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('no avisa en proyectos cerrados', async () => {
    await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, 1) });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    await runDailyJobs(ctx.deps);
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('no avisa en proyectos en pausa', async () => {
    await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, 1) });
    await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, -1) });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'PAUSED' } });
    expect(await runDailyJobs(ctx.deps)).toMatchObject({ dueSoon: 0, overdue: 0 });
    expect(await ctx.prisma.notification.count()).toBe(0);
  });

  it('dos corridas el mismo día no duplican, y otra fecha de fin vuelve a avisar', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [ana], dueDate: addDays(today, 1) });
    await runDailyJobs(ctx.deps);
    await runDailyJobs(ctx.deps);
    expect(await of(ana)).toHaveLength(1);
    await ctx.prisma.task.update({ where: { id: task.id }, data: { dueDate: addDays(today, -1) } });
    await runDailyJobs(ctx.deps);
    expect((await of(ana)).map((n) => n.kind)).toEqual(['TASK_DUE_SOON', 'TASK_OVERDUE']);
  });

  it('borra los avisos de más de 90 días', async () => {
    const row = { userId: ana.id, projectId: project.id, kind: 'TASK_ASSIGNED', entityId: 't', title: 'Vieja' };
    await ctx.prisma.notification.create({ data: { ...row, createdAt: new Date(now.getTime() - 91 * DAY) } });
    await ctx.prisma.notification.create({ data: { ...row, title: 'Reciente', createdAt: new Date(now.getTime() - 89 * DAY) } });
    const result = await runDailyJobs(ctx.deps);
    expect(result.oldNotifications).toBe(1);
    expect((await of(ana)).map((n) => n.title)).toEqual(['Reciente']);
  });
});
