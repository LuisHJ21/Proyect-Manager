import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDailyJobs } from '../src/jobs/daily';
import { createTestApp, type TestCtx } from './helpers/testApp';

/**
 * Proyecto con una padre P y dos hojas terminadas. A P se le guardan a mano valores que la harían
 * contar (vencida, bloqueada, sin avance, con costo y con responsable): ningún cálculo debe verlos.
 */
describe('EDT: los cálculos cuentan solo hojas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let parent: Task;
  let leaves: Task[];

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-05T10:00:00');
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ name: 'Portal', members: [ana], plannedBudgetCents: 100000 });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'EXECUTING', startDate: '2026-01-01', endDate: '2026-12-31' } });
    parent = await ctx.prisma.task.create({
      data: { projectId: project.id, title: 'P', status: 'BLOCKED', progress: 0, plannedCostCents: 100n, dueDate: '2026-11-06', assignees: { create: [{ userId: ana.id }] } },
    });
    leaves = await Promise.all(
      ['H1', 'H2'].map((title, i) =>
        ctx.prisma.task.create({
          data: { projectId: project.id, parentId: parent.id, position: i + 1, title, status: 'DONE', progress: 100, plannedCostCents: 100n, startDate: '2026-11-01', dueDate: '2026-11-04' },
        }),
      ),
    );
  });
  afterEach(() => ctx.close());

  it('indicadores: avance, vencidas y bloqueadas', async () => {
    const body = (await ctx.as(pm).get(`/api/projects/${project.id}/indicators`)).json();
    expect(body).toMatchObject({ progress: 100, overdueTasks: 0, blockedTasks: 0 });
  });

  it('lista de proyectos y panel', async () => {
    const listed = (await ctx.as(pm).get('/api/projects')).json().find((p: { id: string }) => p.id === project.id);
    expect(listed).toMatchObject({ progress: 100, overdueTasks: 0 });
    const dashboard = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(dashboard.projects.find((p: { id: string }) => p.id === project.id).progress).toBe(100);
    expect(dashboard.totals.overdueTasks).toBe(0);
    expect(dashboard.workload).toEqual([]);
    expect(dashboard.attention.filter((a: { kind: string }) => a.kind === 'task')).toEqual([]);
  });

  it('calendario: ni con fecha ni sin fecha', async () => {
    const res = (await ctx.as(pm).get('/api/calendar?from=2026-11-01&to=2026-11-30')).json();
    expect(res.tasks.map((t: { title: string }) => t.title).sort()).toEqual(['H1', 'H2']);
    await ctx.prisma.task.update({ where: { id: parent.id }, data: { dueDate: null } });
    const undated = (await ctx.as(pm).get('/api/calendar?from=2026-11-01&to=2026-11-30')).json();
    expect(JSON.stringify(undated)).not.toContain('"title":"P"');
  });

  it('línea base y valor ganado', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    expect(res.statusCode).toBe(201);
    expect(res.json().bacCents).toBe(200);
    const stored = await ctx.prisma.baselineTask.findMany();
    expect(stored.map((t) => t.taskId).sort()).toEqual(leaves.map((l) => l.id).sort());
    const perf = (await ctx.as(pm).get(`/api/projects/${project.id}/performance`)).json();
    expect(perf.metrics.evCents).toBe(200);
    expect(perf.outsideBaseline).toBe(0);
  });

  it('una tarea de la base que luego pasa a padre queda como eliminada y no suma valor ganado', async () => {
    const solo = await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Sola', progress: 50, plannedCostCents: 400n, startDate: '2026-11-01', dueDate: '2026-11-10' } });
    await ctx.as(pm).post(`/api/projects/${project.id}/baselines`, {});
    await ctx.prisma.task.update({ where: { id: solo.id }, data: { plannedCostCents: 0n } });
    await ctx.prisma.task.create({ data: { projectId: project.id, parentId: solo.id, title: 'Nueva hoja', progress: 0 } });
    const perf = (await ctx.as(pm).get(`/api/projects/${project.id}/performance`)).json();
    expect(perf.tasks.find((t: { taskId: string }) => t.taskId === solo.id).state).toBe('DELETED');
    expect(perf.metrics.evCents).toBe(200);
  });

  it('pendientes del cierre', async () => {
    const closure = (await ctx.as(pm).get(`/api/projects/${project.id}/closure`)).json();
    expect(closure.report.pendings.find((p: { kind: string }) => p.kind === 'tasks')).toBeUndefined();
  });

  it('la tarea diaria no avisa por la padre', async () => {
    await runDailyJobs(ctx.deps);
    expect(await ctx.prisma.notification.count({ where: { entityId: parent.id } })).toBe(0);
  });
});
