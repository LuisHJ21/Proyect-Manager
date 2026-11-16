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
    const nodes = buildWbs(rows.map((r) => ({ ...r, plannedCostCents: Number(r.plannedCostCents), estimatedHours: null })));
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

  describe('una padre no tiene trabajo propio', () => {
    let parent: Task;
    let child: Task;
    beforeEach(async () => {
      parent = await create('Padre');
      child = await create('Hija', parent.id);
    });
    const SUMMARY = 'Una tarea con subtareas se actualiza a través de ellas';

    it('rechaza responsables, costo y fechas en el formulario', async () => {
      for (const [field, body] of [
        ['assigneeIds', { assigneeIds: [ana.id] }],
        ['plannedCostCents', { plannedCostCents: 100 }],
        ['startDate', { startDate: '2026-12-01' }],
        ['dueDate', { dueDate: '2026-12-02' }],
      ] as const) {
        const res = await patch(parent.id, body);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.fields[field]).toBe('Se calcula con sus subtareas');
      }
      expect((await patch(parent.id, { title: 'Fase 1', priority: 'HIGH', milestoneId: null, deliverableId: null })).statusCode).toBe(200);
    });

    it('PUT de responsables también se rechaza', async () => {
      const res = await ctx.as(pm).put(`/api/tasks/${parent.id}/assignees`, { userIds: [ana.id] });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.userIds).toBe('Se calcula con sus subtareas');
    });

    it('avance, pasos, dependencias y gastos se rechazan con 409', async () => {
      const other = await create('Otra');
      const responses = [
        await ctx.as(pm).patch(`/api/tasks/${parent.id}/progress`, { progress: 50 }),
        await ctx.as(pm).post(`/api/tasks/${parent.id}/steps`, { title: 'Paso' }),
        await ctx.as(pm).post(`/api/tasks/${parent.id}/dependencies`, { predecessorId: other.id }),
        await ctx.as(pm).post(`/api/tasks/${other.id}/dependencies`, { predecessorId: parent.id }),
        await ctx.as(pm).post(`/api/projects/${project.id}/expenses`, { description: 'G', amountCents: 100, date: '2026-01-01', category: 'OTHER', taskId: parent.id }),
      ];
      for (const res of responses) {
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toMatchObject({ code: 'task_is_summary', message: SUMMARY });
      }
      expect((await ctx.as(pm).post(`/api/tasks/${child.id}/steps`, { title: 'Paso' })).statusCode).toBe(201);
    });

    it('se puede comentar en una padre', async () => {
      expect((await ctx.as(pm).post(`/api/tasks/${parent.id}/comments`, { body: 'Bien' })).statusCode).toBe(201);
    });
  });

  describe('lo que devuelve la API', () => {
    let parent: Task;
    let h1: Task;
    let h2: Task;
    beforeEach(async () => {
      await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-01-01', endDate: '2026-12-31' } });
      parent = await create('P');
      h1 = await create('H1', parent.id);
      h2 = await create('H2', parent.id);
      await ctx.prisma.task.update({ where: { id: h1.id }, data: { plannedCostCents: 100n, progress: 100, status: 'DONE', startDate: '2026-03-01', dueDate: '2026-03-05' } });
      await ctx.prisma.task.update({ where: { id: h2.id }, data: { plannedCostCents: 300n, progress: 0, startDate: '2026-03-06', dueDate: '2026-03-20' } });
    });

    it('la lista sale en orden EDT con el resumen de la padre', async () => {
      const list = (await ctx.as(pm).get(tasksUrl())).json();
      expect(list.map((t: { title: string }) => t.title)).toEqual(['P', 'H1', 'H2']);
      expect(list[0]).toMatchObject({
        wbsCode: '1', isSummary: true, childCount: 2, parentId: null,
        startDate: '2026-03-01', dueDate: '2026-03-20', progress: 25, status: 'IN_PROGRESS', plannedCostCents: 400,
      });
      expect(list[1]).toMatchObject({ wbsCode: '1.1', isSummary: false, childCount: 0, parentId: parent.id });
    });

    it('el colaborador recibe el resumen sin costo', async () => {
      const [p] = (await ctx.as(ana).get(tasksUrl())).json();
      expect(p).toMatchObject({ wbsCode: '1', progress: 25, status: 'IN_PROGRESS', dueDate: '2026-03-20' });
      expect(p).not.toHaveProperty('plannedCostCents');
      const detail = (await ctx.as(ana).get(`/api/tasks/${parent.id}`)).json();
      expect(detail).toMatchObject({ wbsCode: '1', progress: 25 });
      expect(detail).not.toHaveProperty('plannedCostCents');
    });

    it('el detalle trae antecesoras y subtareas', async () => {
      const child = (await ctx.as(pm).get(`/api/tasks/${h1.id}`)).json();
      expect(child.ancestors).toEqual([{ id: parent.id, title: 'P', wbsCode: '1' }]);
      const p = (await ctx.as(pm).get(`/api/tasks/${parent.id}`)).json();
      expect(p.children).toEqual([
        { id: h1.id, title: 'H1', wbsCode: '1.1' },
        { id: h2.id, title: 'H2', wbsCode: '1.2' },
      ]);
    });

    it('una tarea se liga a un entregable del proyecto y el entregable muestra el trabajo', async () => {
      const deliverable = (await ctx.as(pm).post(`/api/projects/${project.id}/deliverables`, { name: 'Portal' })).json();
      const other = await ctx.makeProject();
      const foreign = (await ctx.as(pm).post(`/api/projects/${other.id}/deliverables`, { name: 'Ajeno' })).json();
      const bad = await patch(h1.id, { deliverableId: foreign.id });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.fields.deliverableId).toBe('Elige un entregable de este proyecto');
      expect((await patch(h1.id, { deliverableId: deliverable.id })).statusCode).toBe(200);
      const detail = (await ctx.as(ana).get(`/api/projects/${project.id}/deliverables/${deliverable.id}`)).json();
      expect(detail.work).toEqual([{ id: h1.id, title: 'H1', wbsCode: '1.1', progress: 100 }]);
    });
  });

  describe('hallazgos de la revisión final', () => {
    it('al recibir su primera subtarea, la padre pierde sus fechas, avance y estado propios', async () => {
      await ctx.prisma.project.update({ where: { id: project.id }, data: { startDate: '2026-01-01', endDate: '2026-12-31' } });
      const t = await ctx.makeTask(project.id, { title: 'Fase', startDate: '2026-03-01', dueDate: '2026-03-31', progress: 40, status: 'IN_PROGRESS' });
      const child = await create('Hija', t.id);
      expect(await ctx.prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ startDate: null, dueDate: null, progress: 0, status: 'TODO' });
      // Las fechas guardadas ya no impiden mover el inicio del proyecto.
      expect((await ctx.as(pm).patch(`/api/projects/${project.id}`, { startDate: '2026-03-15' })).statusCode).toBe(200);
      // Si la última subtarea se va, la ex padre no recupera valores viejos.
      expect((await ctx.as(pm).delete(`/api/tasks/${child.id}`)).statusCode).toBe(200);
      const back = (await ctx.as(pm).get(`/api/tasks/${t.id}`)).json();
      expect(back).toMatchObject({ isSummary: false, startDate: null, dueDate: null, progress: 0 });
    });

    it('también al mover una tarea bajo una hoja con fechas', async () => {
      const t = await ctx.makeTask(project.id, { title: 'Fase', startDate: '2026-03-01', dueDate: '2026-03-31' });
      const loose = await create('Suelta');
      expect((await patch(loose.id, { parentId: t.id })).statusCode).toBe(200);
      expect(await ctx.prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ startDate: null, dueDate: null });
    });

    it('un hito ligado a una padre está listo cuando sus hojas están hechas', async () => {
      const milestone = await ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Lanzamiento', dueDate: '2026-12-01' } });
      const phase = await create('Fase');
      const sub = await create('Sub', phase.id);
      const leaf = await create('Hoja', sub.id);
      await ctx.prisma.task.update({ where: { id: phase.id }, data: { milestoneId: milestone.id } });
      const ready = async () => (await ctx.as(pm).get(`/api/projects/${project.id}/milestones`)).json()[0].readyToReach;
      expect(await ready()).toBe(false);
      await ctx.prisma.task.update({ where: { id: leaf.id }, data: { status: 'DONE', progress: 100 } });
      expect(await ready()).toBe(true);
    });
  });
});
