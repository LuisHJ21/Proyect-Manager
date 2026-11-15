import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('fechas de tarea dentro del proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    project = await ctx.makeProject();
    await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-11-01', endDate: '2026-11-30' } });
  });
  afterEach(() => ctx.close());

  const create = (body: object) => ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', ...body });

  it('POST acepta el primer y el último día', async () => {
    expect((await create({ startDate: '2026-11-01', dueDate: '2026-11-30' })).statusCode).toBe(201);
  });

  it('POST rechaza inicio fuera, con error por campo y las fechas del proyecto', async () => {
    const res = await create({ startDate: '2026-10-31' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.startDate).toBe('La fecha debe estar dentro del proyecto (2026-11-01 a 2026-11-30)');
  });

  it('POST rechaza fecha límite fuera', async () => {
    const res = await create({ dueDate: '2026-12-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.dueDate).toContain('dentro del proyecto');
  });

  it('un proyecto sin fechas no limita', async () => {
    const free = await ctx.makeProject();
    const res = await ctx.as(pm).post(`/api/projects/${free.id}/tasks`, { title: 'T', dueDate: '2040-01-01' });
    expect(res.statusCode).toBe(201);
  });

  it('una tarea ya fuera se puede renombrar', async () => {
    const task = await ctx.makeTask(project.id, { dueDate: '2027-05-01' });
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Nuevo', dueDate: '2027-05-01', version: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Nuevo');
  });

  it('PATCH rechaza mover una fecha fuera y no guarda nada', async () => {
    const task = await ctx.makeTask(project.id, { title: 'Original', dueDate: '2026-11-10' });
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { title: 'Cambiado', dueDate: '2026-12-10', version: 1 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.dueDate).toBeTruthy();
    expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe('Original');
  });

  it('cambiar el fin del proyecto rechaza si deja tareas fuera, e indica cuántas', async () => {
    await ctx.makeTask(project.id, { dueDate: '2026-11-20' });
    await ctx.makeTask(project.id, { dueDate: '2026-11-25' });
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { endDate: '2026-11-15' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.endDate).toContain('2 tareas');
    expect((await ctx.prisma.project.findUniqueOrThrow({ where: { id: project.id } })).endDate).toBe('2026-11-30');
  });

  it('cambiar el inicio del proyecto rechaza si deja una tarea fuera', async () => {
    await ctx.makeTask(project.id, { startDate: '2026-11-02' });
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { startDate: '2026-11-10' });
    expect(res.json().error.fields.startDate).toContain('1 tarea');
  });

  it('no se comprueba la fecha que no cambia', async () => {
    await ctx.makeTask(project.id, { dueDate: '2027-05-01' });
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}`, { name: 'Otro', startDate: '2026-10-01', endDate: '2026-11-30' });
    expect(res.statusCode).toBe(200);
  });

  it('ampliar el proyecto se acepta, y las tareas existentes no se modifican', async () => {
    const task = await ctx.makeTask(project.id, { dueDate: '2027-05-01' });
    expect((await ctx.as(pm).patch(`/api/projects/${project.id}`, { endDate: '2026-12-31' })).json().endDate).toBe('2026-12-31');
    expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate).toBe('2027-05-01');
  });
});
