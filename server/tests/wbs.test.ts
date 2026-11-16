import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWbs } from '../src/domain/wbs';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('EDT: jerarquía de tareas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const tasksUrl = () => `/api/projects/${project.id}/tasks`;
  const create = async (title: string, parentId: string | null = null) => {
    const res = await ctx.as(pm).post(tasksUrl(), { title, parentId });
    expect(res.statusCode).toBe(201);
    return res.json() as Task;
  };
  const versionOf = async (id: string) => (await ctx.prisma.task.findUniqueOrThrow({ where: { id } })).version;
  const patch = async (id: string, body: object) => ctx.as(pm).patch(`/api/tasks/${id}`, { ...body, version: await versionOf(id) });
  /** Códigos EDT calculados con lo guardado, por título. */
  const codes = async () => {
    const rows = await ctx.prisma.task.findMany({ where: { projectId: project.id } });
    const nodes = buildWbs(rows.map((r) => ({ ...r, plannedCostCents: Number(r.plannedCostCents) })));
    return Object.fromEntries(rows.map((r) => [r.title, nodes.get(r.id)!.code]));
  };
  const move = (id: string, direction: 'up' | 'down', user = pm) => ctx.as(user).post(`/api/tasks/${id}/move`, { direction });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('una subtarea queda al final de sus hermanas', async () => {
    const root = await create('Diseño');
    await create('Maquetas', root.id);
    await create('Guía', root.id);
    expect(await codes()).toEqual({ Diseño: '1', Maquetas: '1.1', Guía: '1.2' });
  });

  it('la padre debe ser del mismo proyecto', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.makeTask(other.id, { title: 'Ajena' });
    const res = await ctx.as(pm).post(tasksUrl(), { title: 'X', parentId: foreign.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.parentId).toBe('Elige una tarea de este proyecto');
  });

  it('una tarea no puede quedar dentro de sí misma ni de sus descendientes', async () => {
    const a = await create('A');
    const b = await create('B', a.id);
    const c = await create('C', b.id);
    for (const parentId of [a.id, c.id]) {
      const res = await patch(a.id, { parentId });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.parentId).toBe('Una tarea no puede quedar dentro de sí misma');
    }
  });

  it('la EDT admite hasta 4 niveles, contando la rama que se mueve', async () => {
    const l1 = await create('N1');
    const l2 = await create('N2', l1.id);
    const l3 = await create('N3', l2.id);
    await create('N4', l3.id);
    const fifth = await ctx.as(pm).post(tasksUrl(), { title: 'N5', parentId: (await ctx.prisma.task.findFirstOrThrow({ where: { title: 'N4' } })).id });
    expect(fifth.statusCode).toBe(400);
    expect(fifth.json().error.fields.parentId).toBe('La EDT admite hasta 4 niveles');
    const branch = await create('Rama');
    await create('Hoja de la rama', branch.id);
    const res = await patch(branch.id, { parentId: l3.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.parentId).toBe('La EDT admite hasta 4 niveles');
  });

  it('no se añaden subtareas a una tarea con trabajo propio, y se dice qué mover', async () => {
    const busy = await ctx.makeTask(project.id, { title: 'Ocupada', assignees: [ana] });
    await ctx.prisma.task.update({ where: { id: busy.id }, data: { plannedCostCents: 5000n } });
    await ctx.makeStep(busy.id);
    await ctx.makeStep(busy.id);
    await ctx.prisma.expense.create({ data: { projectId: project.id, description: 'G', amountCents: 100n, date: '2026-01-01', category: 'OTHER', taskId: busy.id } });
    const res = await ctx.as(pm).post(tasksUrl(), { title: 'Hija', parentId: busy.id });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'task_has_work',
      message: 'Esta tarea tiene trabajo propio. Antes de añadirle subtareas, quita o mueve: responsables, costo planeado, 2 pasos, 1 gasto',
    });
    const linked = await create('Con dependencia');
    const other = await create('Otra');
    await ctx.prisma.taskDependency.create({ data: { predecessorId: other.id, successorId: linked.id } });
    const dep = await ctx.as(pm).post(tasksUrl(), { title: 'Hija', parentId: linked.id });
    expect(dep.json().error.message).toBe('Esta tarea tiene trabajo propio. Antes de añadirle subtareas, quita o mueve: dependencias');
    const free = await create('Libre');
    expect((await ctx.as(pm).post(tasksUrl(), { title: 'Hija', parentId: free.id })).statusCode).toBe(201);
  });

  it('mover a otra padre la deja al final, y en la raíz con null', async () => {
    const a = await create('A');
    const b = await create('B');
    await create('B1', b.id);
    expect((await patch(a.id, { parentId: b.id })).statusCode).toBe(200);
    expect(await codes()).toMatchObject({ B: '1', B1: '1.1', A: '1.2' });
    expect((await patch(a.id, { parentId: null })).statusCode).toBe(200);
    expect(await codes()).toMatchObject({ B: '1', A: '2' });
  });

  it('borrar una padre se rechaza; sin su última hija vuelve a admitir trabajo', async () => {
    const parent = await create('Padre');
    const child = await create('Hija', parent.id);
    const res = await ctx.as(pm).delete(`/api/tasks/${parent.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'task_has_children', message: 'Mueve o borra primero sus subtareas' });
    expect((await ctx.as(pm).delete(`/api/tasks/${child.id}`)).statusCode).toBe(200);
    expect((await patch(parent.id, { assigneeIds: [ana.id], plannedCostCents: 100 })).statusCode).toBe(200);
  });

  it('subir y bajar entre hermanas', async () => {
    const root = await create('R');
    const a = await create('A', root.id);
    const b = await create('B', root.id);
    const c = await create('C', root.id);
    expect((await move(b.id, 'up')).statusCode).toBe(200);
    expect(await codes()).toMatchObject({ B: '1.1', A: '1.2', C: '1.3' });
    expect((await move(b.id, 'up')).statusCode).toBe(200);
    expect((await move(c.id, 'down')).statusCode).toBe(200);
    expect(await codes()).toMatchObject({ B: '1.1', A: '1.2', C: '1.3' });
    expect((await ctx.as(pm).delete(`/api/tasks/${a.id}`)).statusCode).toBe(200);
    expect(await codes()).toMatchObject({ B: '1.1', C: '1.2' });
    expect((await move(c.id, 'up', ana)).statusCode).toBe(403);
  });

  it('move exige una dirección válida', async () => {
    const a = await create('A');
    expect((await ctx.as(pm).post(`/api/tasks/${a.id}/move`, { direction: 'left' })).statusCode).toBe(400);
  });
});
