import type { Milestone, Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDailyJobs } from '../src/jobs/daily';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('tendencia de hitos', () => {
  let ctx: TestCtx;
  let pm: User;
  let obs: User;
  let project: Project;
  let launch: Milestone;
  const url = () => `/api/projects/${project.id}/milestone-trend`;

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-16T10:00:00');
    pm = await ctx.makeUser({ role: 'PM' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [obs] });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING' } });
    launch = await ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Lanzamiento', dueDate: '2026-11-30' } });
    const task = await ctx.makeTask(project.id, { title: 'Pruebas', dueDate: '2026-12-05' });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { milestoneId: launch.id } });
  });
  afterEach(() => ctx.close());

  it('la tarea diaria guarda un pronóstico por hito y día, sin duplicar', async () => {
    await runDailyJobs(ctx.deps);
    await runDailyJobs(ctx.deps);
    expect(await ctx.prisma.milestoneForecast.findMany({ select: { date: true, forecastDate: true } })).toEqual([{ date: '2026-11-16', forecastDate: '2026-12-05' }]);
    await ctx.prisma.task.updateMany({ where: { milestoneId: launch.id }, data: { dueDate: '2026-12-08' } });
    await runDailyJobs(ctx.deps);
    expect((await ctx.prisma.milestoneForecast.findFirstOrThrow()).forecastDate).toBe('2026-12-08');
    ctx.clock.set('2026-11-17T10:00:00');
    await runDailyJobs(ctx.deps);
    expect(await ctx.prisma.milestoneForecast.count()).toBe(2);
  });

  it('la ruta devuelve pronóstico en vivo, desvío e historial, y la lee el observador', async () => {
    await runDailyJobs(ctx.deps);
    const res = await ctx.as(obs).get(url());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: launch.id, name: 'Lanzamiento', dueDate: '2026-11-30', status: 'PENDING', forecastDate: '2026-12-05', slipDays: 5, history: [{ date: '2026-11-16', forecastDate: '2026-12-05' }] },
    ]);
  });
});
