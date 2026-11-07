import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('las tareas solo se asignan a colaboradores', () => {
  let ctx: TestCtx;
  let pm: User;
  let otherPm: User;
  let collaborator: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    otherPm = await ctx.makeUser({ role: 'PM' });
    collaborator = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [otherPm, collaborator] });
  });
  afterEach(() => ctx.close());

  it('rechaza asignar a un PM al crear la tarea, aunque sea miembro', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [otherPm.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.assigneeIds).toBeTruthy();
  });

  it('rechaza asignar a un PM al editar', async () => {
    const task = await ctx.makeTask(project.id);
    const patch = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [otherPm.id] });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.fields.assigneeIds).toBeTruthy();
    const put = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [otherPm.id] });
    expect(put.statusCode).toBe(400);
    expect(put.json().error.fields.userIds).toBeTruthy();
  });

  it('asignar a un colaborador sigue funcionando', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [collaborator.id] });
    expect(res.statusCode).toBe(201);
  });

  it('un colaborador desactivado ya asignado se conserva', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    await ctx.prisma.user.update({ where: { id: collaborator.id }, data: { active: false } });
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [collaborator.id] });
    expect(res.statusCode).toBe(200);
  });

  it('cambiar un colaborador a PM quita todas sus asignaciones', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    const res = await ctx.as(pm).patch(`/api/users/${collaborator.id}`, { role: 'PM' });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('PM');
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('cambiar otros campos no toca las asignaciones', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    await ctx.as(pm).patch(`/api/users/${collaborator.id}`, { name: 'Otro nombre' });
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('la migración elimina solo asignaciones de usuarios con rol PM', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [otherPm, collaborator] });
    const dir = resolve(__dirname, '../prisma/migrations');
    const name = readdirSync(dir).find((entry) => entry.endsWith('_remove_pm_assignments'));
    expect(name).toBeTruthy();
    await ctx.prisma.$executeRawUnsafe(readFileSync(resolve(dir, name!, 'migration.sql'), 'utf8'));
    const left = await ctx.prisma.taskAssignee.findMany({ where: { taskId: task.id } });
    expect(left.map((a) => a.userId)).toEqual([collaborator.id]);
  });
});
