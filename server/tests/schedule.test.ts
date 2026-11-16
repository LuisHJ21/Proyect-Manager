import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('GET /api/projects/:id/schedule', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const url = () => `/api/projects/${project.id}/schedule`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
    await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-01-01', endDate: '2026-01-05' } });
  });
  afterEach(() => ctx.close());

  it('calcula la ruta crítica de las hojas y el colaborador la lee', async () => {
    const parent = await ctx.makeTask(project.id, { title: 'Fase' });
    const a = await ctx.prisma.task.create({ data: { projectId: project.id, parentId: parent.id, title: 'A', startDate: '2026-01-01', dueDate: '2026-01-03', plannedCostCents: 500n } });
    const b = await ctx.prisma.task.create({ data: { projectId: project.id, parentId: parent.id, title: 'B', startDate: '2026-01-04', dueDate: '2026-01-05' } });
    const loose = await ctx.makeTask(project.id, { title: 'Sin fechas' });
    await ctx.prisma.taskDependency.create({ data: { predecessorId: a.id, successorId: b.id } });
    const res = await ctx.as(ana).get(url());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.critical).toEqual([a.id, b.id]);
    expect(body.tasks.map((t: { id: string }) => t.id).sort()).toEqual([a.id, b.id].sort());
    expect(body.unscheduled).toEqual([loose.id]);
    expect(JSON.stringify(body)).not.toContain('plannedCostCents');
  });
});
