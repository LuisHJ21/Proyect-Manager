import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const hasCostKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasCostKey);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, inner]) => key === 'plannedCostCents' || hasCostKey(inner));
  }
  return false;
};

describe('costo planeado y gastos por tarea', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let task: Task;
  const expenses = (id = project.id) => `/api/projects/${id}/expenses`;
  const expense = { description: 'Licencia', amountCents: 1000, date: '2026-11-01', category: 'SERVICES' };

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
    task = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana], dueDate: '2026-11-20' });
    await ctx.prisma.task.update({ where: { id: task.id }, data: { plannedCostCents: 500000 } });
  });
  afterEach(() => ctx.close());

  it('el PM guarda y lee el costo planeado', async () => {
    const created = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'Nueva', plannedCostCents: 500000 });
    expect(created.statusCode).toBe(201);
    expect(created.json().plannedCostCents).toBe(500000);
    const patched = await ctx.as(pm).patch(`/api/tasks/${created.json().id}`, { plannedCostCents: 750000, version: 1 });
    expect(patched.json().plannedCostCents).toBe(750000);
  });

  it('ninguna ruta de tareas falla ni filtra el costo', async () => {
    const asAna = ctx.as(ana);
    for (const res of [
      await asAna.get(`/api/projects/${project.id}/tasks`),
      await asAna.get('/api/me/tasks'),
      await asAna.get(`/api/tasks/${task.id}`),
      await asAna.patch(`/api/tasks/${task.id}/progress`, { progress: 10 }),
    ]) {
      expect(res.statusCode).toBe(200);
      expect(hasCostKey(res.json())).toBe(false);
    }
    const before = await ctx.makeTask(project.id, { title: 'Antes' });
    const dep = await ctx.as(pm).post(`/api/tasks/${task.id}/dependencies`, { predecessorId: before.id });
    expect(dep.statusCode).toBe(201);
    expect(dep.json().plannedCostCents).toBe(500000);
    expect((await ctx.as(pm).get('/api/calendar?from=2026-11-01&to=2026-11-30')).statusCode).toBe(200);
    expect((await ctx.as(pm).get(`/api/users/${ana.id}/tasks`)).statusCode).toBe(200);
    expect((await ctx.as(pm).get('/api/dashboard')).statusCode).toBe(200);
  });

  it('un gasto se liga a una tarea del proyecto', async () => {
    const created = await ctx.as(pm).post(expenses(), { ...expense, taskId: task.id });
    expect(created.statusCode).toBe(201);
    expect(created.json().taskId).toBe(task.id);
    const other = await ctx.makeProject();
    const foreign = await ctx.makeTask(other.id);
    const res = await ctx.as(pm).post(expenses(), { ...expense, taskId: foreign.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.taskId).toBeTruthy();
    const patched = await ctx.as(pm).patch(`${expenses()}/${created.json().id}`, { taskId: foreign.id });
    expect(patched.statusCode).toBe(400);
  });

  it('borrar la tarea deja el gasto sin tarea', async () => {
    const created = await ctx.as(pm).post(expenses(), { ...expense, taskId: task.id });
    await ctx.as(pm).delete(`/api/tasks/${task.id}`);
    expect((await ctx.prisma.expense.findUniqueOrThrow({ where: { id: created.json().id } })).taskId).toBeNull();
  });
});
