import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('fechas de hito dentro del proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  let project: Project;
  const OUTSIDE = 'La fecha debe estar dentro del proyecto (2026-01-01 a 2026-06-30)';
  const url = () => `/api/projects/${project.id}/milestones`;
  const milestone = (dueDate: string) => ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Hito', dueDate } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    project = await ctx.makeProject();
    await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-01-01', endDate: '2026-06-30' } });
  });
  afterEach(() => ctx.close());

  it('crear un hito fuera del proyecto responde 400 en la fecha', async () => {
    const res = await ctx.as(pm).post(url(), { name: 'Entrega', dueDate: '2026-07-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.dueDate).toBe(OUTSIDE);
    expect(await ctx.prisma.milestone.count()).toBe(0);
  });

  it('se acepta el primer y el último día', async () => {
    expect((await ctx.as(pm).post(url(), { name: 'A', dueDate: '2026-01-01' })).statusCode).toBe(201);
    expect((await ctx.as(pm).post(url(), { name: 'B', dueDate: '2026-06-30' })).statusCode).toBe(201);
  });

  it('editar un hito a una fecha fuera responde 400', async () => {
    const m = await milestone('2026-03-01');
    const res = await ctx.as(pm).patch(`${url()}/${m.id}`, { dueDate: '2025-12-31' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.dueDate).toBe(OUTSIDE);
  });

  it('un hito que ya estaba fuera se puede renombrar', async () => {
    const m = await milestone('2026-08-01');
    expect((await ctx.as(pm).patch(`${url()}/${m.id}`, { name: 'Otro' })).statusCode).toBe(200);
  });

  it('un proyecto sin fechas no limita', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: null, endDate: null } });
    expect((await ctx.as(pm).post(url(), { name: 'Lejos', dueDate: '2030-01-01' })).statusCode).toBe(201);
  });

  it('cambiar el fin del proyecto rechaza si deja un hito fuera', async () => {
    await milestone('2026-06-15');
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { endDate: '2026-06-10' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.endDate).toBe('1 hito quedaría fuera del proyecto. Ajusta su fecha primero.');
  });

  it('indica cuántos hitos quedarían fuera', async () => {
    await milestone('2026-01-05');
    await milestone('2026-01-06');
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { startDate: '2026-02-01' });
    expect(res.json().error.fields.startDate).toBe('2 hitos quedarían fuera del proyecto. Ajusta sus fechas primero.');
  });

  it('un hito que ya estaba fuera no impide editar el proyecto', async () => {
    await milestone('2026-08-01');
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { endDate: '2026-06-20' });
    expect(res.statusCode).toBe(200);
  });
});
