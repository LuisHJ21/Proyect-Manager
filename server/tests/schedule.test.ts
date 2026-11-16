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

  describe('reprogramar sucesoras', () => {
    const chain = async () => {
      await ctx.prisma.project.update({ where: { id: project.id }, data: { endDate: '2026-01-31' } });
      const make = (title: string, startDate: string, dueDate: string) => ctx.prisma.task.create({ data: { projectId: project.id, title, startDate, dueDate } });
      const a = await make('A', '2026-01-01', '2026-01-08');
      const b = await make('B', '2026-01-06', '2026-01-07');
      const c = await make('C', '2026-01-08', '2026-01-10');
      await ctx.prisma.taskDependency.create({ data: { predecessorId: a.id, successorId: b.id } });
      await ctx.prisma.taskDependency.create({ data: { predecessorId: b.id, successorId: c.id } });
      return { a, b, c };
    };
    const reschedule = (id: string, apply: boolean, user = pm) => ctx.as(user).post(`/api/tasks/${id}/reschedule`, { apply });

    it('propone sin guardar y aplica subiendo la versión', async () => {
      const { a, b, c } = await chain();
      const preview = await reschedule(a.id, false);
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ applied: false, changes: [{ id: b.id, to: { startDate: '2026-01-09' } }, { id: c.id, to: { startDate: '2026-01-11' } }] });
      expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: b.id } })).startDate).toBe('2026-01-06');
      const applied = await reschedule(a.id, true);
      expect(applied.json().applied).toBe(true);
      const saved = await ctx.prisma.task.findUniqueOrThrow({ where: { id: b.id } });
      expect(saved).toMatchObject({ startDate: '2026-01-09', dueDate: '2026-01-10', version: 2 });
      expect((await reschedule(a.id, false)).json().changes).toEqual([]);
    });

    it('si alguna fecha nueva cae fuera del proyecto no guarda nada', async () => {
      const { a, b } = await chain();
      await ctx.prisma.project.update({ where: { id: project.id }, data: { endDate: '2026-01-12' } });
      const res = await reschedule(a.id, true);
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'reschedule_outside', message: 'La reprogramación deja tareas fuera del proyecto: C' });
      expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: b.id } })).startDate).toBe('2026-01-06');
    });

    it('el colaborador no reprograma', async () => {
      const { a } = await chain();
      expect((await reschedule(a.id, false, ana)).statusCode).toBe(403);
    });
  });
});
