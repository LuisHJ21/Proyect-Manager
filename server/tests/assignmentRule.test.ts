import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const MESSAGE = 'Solo se pueden asignar miembros activos del proyecto';

describe('las tareas se asignan a miembros activos, PM incluidos', () => {
  let ctx: TestCtx;
  let pm: User;
  let otherPm: User;
  let collaborator: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    otherPm = await ctx.makeUser({ role: 'PM', name: 'Olga' });
    collaborator = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [otherPm, collaborator] });
  });
  afterEach(() => ctx.close());

  it('asigna a un PM miembro al crear la tarea', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [otherPm.id, collaborator.id] });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignees.map((a: { name: string }) => a.name).sort()).toEqual(['Ana', 'Olga']);
  });

  it('asigna a un PM miembro al editar', async () => {
    const task = await ctx.makeTask(project.id);
    expect((await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [otherPm.id] })).statusCode).toBe(200);
    const put = await ctx.as(pm).put(`/api/tasks/${task.id}/assignees`, { userIds: [otherPm.id, collaborator.id] });
    expect(put.statusCode).toBe(200);
  });

  it('rechaza a un PM que no es miembro', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [pm.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.assigneeIds).toBe(MESSAGE);
  });

  it('rechaza a un PM miembro inactivo', async () => {
    await ctx.prisma.user.update({ where: { id: otherPm.id }, data: { active: false } });
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeIds: [otherPm.id] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.assigneeIds).toBe(MESSAGE);
  });

  it('un colaborador desactivado ya asignado se conserva', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    await ctx.prisma.user.update({ where: { id: collaborator.id }, data: { active: false } });
    const res = await ctx.as(pm).patch(`/api/tasks/${task.id}`, { assigneeIds: [collaborator.id] });
    expect(res.statusCode).toBe(200);
  });

  it('ascender a PM conserva sus tareas y pasos', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    const step = await ctx.prisma.taskStep.create({ data: { taskId: task.id, title: 'Paso', assigneeId: collaborator.id } });
    const res = await ctx.as(pm).patch(`/api/users/${collaborator.id}`, { role: 'PM' });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('PM');
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id, userId: collaborator.id } })).toBe(1);
    expect((await ctx.prisma.taskStep.findUniqueOrThrow({ where: { id: step.id } })).assigneeId).toBe(collaborator.id);
  });

  it('pasar de PM a Colaborador conserva sus tareas', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [otherPm] });
    expect((await ctx.as(pm).patch(`/api/users/${otherPm.id}`, { role: 'COLLABORATOR' })).statusCode).toBe(200);
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id, userId: otherPm.id } })).toBe(1);
  });

  it('quitar a un PM del proyecto le quita sus tareas del proyecto', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [otherPm] });
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/members/${otherPm.id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('cambiar otros campos no toca las asignaciones', async () => {
    const task = await ctx.makeTask(project.id, { assignees: [collaborator] });
    await ctx.as(pm).patch(`/api/users/${collaborator.id}`, { name: 'Otro nombre' });
    expect(await ctx.prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(1);
  });
});
