import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('dependencias', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let design: Task;
  let build: Task;

  const link = (predecessor: Task, successor: Task) =>
    ctx.as(pm).post(`/api/tasks/${successor.id}/dependencies`, { predecessorId: predecessor.id });
  const progress = (user: User, task: Task, body: object) => ctx.as(user).patch(`/api/tasks/${task.id}/progress`, body);
  const dto = async (task: Task) => (await ctx.as(pm).get(`/api/tasks/${task.id}`)).json();

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
    design = await ctx.makeTask(project.id, { title: 'Diseño', assignees: [ana] });
    build = await ctx.makeTask(project.id, { title: 'Construcción', assignees: [ana] });
  });
  afterEach(() => ctx.close());

  it('crear la dependencia devuelve predecessorIds y waitingOn', async () => {
    const res = await link(design, build);
    expect(res.statusCode).toBe(201);
    expect(res.json().predecessorIds).toEqual([design.id]);
    expect(res.json().waitingOn).toEqual([{ id: design.id, title: 'Diseño' }]);
  });

  it('un ciclo responde 409 con la cadena de títulos', async () => {
    await link(design, build);
    const res = await link(build, design);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('dependency_cycle');
    const titles = res.json().error.details.chain.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['Diseño', 'Construcción', 'Diseño']);
  });

  it('una tarea no puede depender de sí misma', async () => {
    expect((await link(design, design)).json().error.code).toBe('dependency_cycle');
  });

  it('rechaza una predecesora de otro proyecto con 400', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.makeTask(other.id);
    const res = await link(foreign, build);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.predecessorId).toBeTruthy();
  });

  it('dependencia duplicada responde 409 dependency_exists', async () => {
    await link(design, build);
    const res = await link(design, build);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('dependency_exists');
  });

  it('el bloqueo aplica también al PM e indica qué falta', async () => {
    await link(design, build);
    const res = await progress(pm, build, { status: 'IN_PROGRESS' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('predecessors_pending');
    expect(res.json().error.details.pending).toEqual([{ id: design.id, title: 'Diseño' }]);
    expect((await dto(build)).status).toBe('TODO');
  });

  it('subir el avance de una tarea en espera se rechaza y no se guarda', async () => {
    await link(design, build);
    const res = await progress(ana, build, { progress: 10 });
    expect(res.statusCode).toBe(409);
    expect((await dto(build)).progress).toBe(0);
  });

  it('una tarea en espera se puede marcar como Bloqueada sin advertencia', async () => {
    await link(design, build);
    const res = await progress(ana, build, { status: 'BLOCKED' });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
  });

  it('la sucesora avanza cuando todas sus predecesoras están DONE', async () => {
    const review = await ctx.makeTask(project.id, { title: 'Revisión' });
    await link(design, build);
    await link(review, build);
    await progress(pm, design, { status: 'DONE' });
    expect((await progress(ana, build, { status: 'IN_PROGRESS' })).statusCode).toBe(409);
    await progress(pm, review, { status: 'DONE' });
    const res = await progress(ana, build, { status: 'IN_PROGRESS' });
    expect(res.statusCode).toBe(200);
    expect(res.json().waitingOn).toEqual([]);
  });

  it('al reabrir la predecesora, la sucesora conserva estado y muestra la advertencia', async () => {
    await link(design, build);
    await progress(pm, design, { status: 'DONE' });
    await progress(pm, build, { status: 'IN_PROGRESS' });
    await progress(pm, design, { status: 'IN_PROGRESS' });
    const current = await dto(build);
    expect(current.status).toBe('IN_PROGRESS');
    expect(current.warnings).toContain('predecessor_not_done');
  });

  it('rechaza una fecha de inicio anterior a la límite de la predecesora', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-05' });
    const res = await link(a, b);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.startDate).toBeTruthy();
  });

  it('fin a inicio: empezar el mismo día del fin se rechaza; al día siguiente se admite', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-10' });
    expect((await link(a, b)).statusCode).toBe(400);
    const c2 = await ctx.makeTask(project.id, { startDate: '2026-12-11' });
    expect((await link(a, c2)).json().warnings).toEqual([]);
  });

  it('crear una tarea con varias predecesoras valida la fecha y guarda los enlaces', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { dueDate: '2026-12-15' });
    const url = `/api/projects/${project.id}/tasks`;
    const bad = await ctx.as(pm).post(url, { title: 'Nueva', startDate: '2026-12-14', predecessorIds: [a.id, b.id] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.startDate).toBeTruthy();
    const good = await ctx.as(pm).post(url, { title: 'Nueva', startDate: '2026-12-16', predecessorIds: [a.id, b.id] });
    expect(good.statusCode).toBe(201);
    expect(good.json().predecessorIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('no permite mover fechas de tareas enlazadas a un orden inválido', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-11' });
    expect((await link(a, b)).statusCode).toBe(201);
    const version = (await dto(b)).version;
    expect((await ctx.as(pm).patch(`/api/tasks/${b.id}`, { version, startDate: '2026-12-10' })).statusCode).toBe(400);
    const predecessorVersion = (await dto(a)).version;
    expect((await ctx.as(pm).patch(`/api/tasks/${a.id}`, { version: predecessorVersion, dueDate: '2026-12-11' })).statusCode).toBe(400);
  });

  it('tipo y desfase: se guardan, se editan y se validan', async () => {
    const a = await ctx.makeTask(project.id, { startDate: '2026-12-01', dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-03', dueDate: '2026-12-20' });
    const res = await ctx.as(pm).post(`/api/tasks/${b.id}/dependencies`, { predecessorId: a.id, type: 'SS', lagDays: 2 });
    expect(res.statusCode).toBe(201);
    expect(res.json().predecessors).toEqual([{ id: a.id, type: 'SS', lagDays: 2 }]);
    expect(res.json().warnings).not.toContain('date_conflict');
    const changed = await ctx.as(pm).patch(`/api/tasks/${b.id}/dependencies/${a.id}`, { type: 'FF', lagDays: 0 });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().predecessors).toEqual([{ id: a.id, type: 'FF', lagDays: 0 }]);
    expect((await ctx.as(ana).patch(`/api/tasks/${b.id}/dependencies/${a.id}`, { lagDays: 1 })).statusCode).toBe(403);
    expect((await ctx.as(pm).patch(`/api/tasks/${b.id}/dependencies/${a.id}`, { lagDays: 400 })).statusCode).toBe(400);
  });

  it('inicio a inicio: con la predecesora en curso, la sucesora puede empezar', async () => {
    const a = await ctx.makeTask(project.id, { assignees: [ana] });
    const b = await ctx.makeTask(project.id, { assignees: [ana] });
    await ctx.as(pm).post(`/api/tasks/${b.id}/dependencies`, { predecessorId: a.id, type: 'SS' });
    expect((await progress(ana, b, { status: 'IN_PROGRESS' })).statusCode).toBe(409);
    await progress(ana, a, { status: 'IN_PROGRESS' });
    expect((await progress(ana, b, { status: 'IN_PROGRESS' })).statusCode).toBe(200);
  });

  it('quitar la dependencia permite avanzar', async () => {
    await link(design, build);
    const removed = await ctx.as(pm).delete(`/api/tasks/${build.id}/dependencies/${design.id}`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().predecessorIds).toEqual([]);
    expect((await progress(ana, build, { status: 'IN_PROGRESS' })).statusCode).toBe(200);
  });

  it('quitar una dependencia inexistente responde 404', async () => {
    expect((await ctx.as(pm).delete(`/api/tasks/${build.id}/dependencies/${design.id}`)).statusCode).toBe(404);
  });

  it('colaborador recibe 403 al crear y quitar dependencias', async () => {
    const client = ctx.as(ana);
    expect((await client.post(`/api/tasks/${build.id}/dependencies`, { predecessorId: design.id })).statusCode).toBe(403);
    expect((await client.delete(`/api/tasks/${build.id}/dependencies/${design.id}`)).statusCode).toBe(403);
  });

  it('eliminar una predecesora libera a la sucesora', async () => {
    await link(design, build);
    await ctx.as(pm).delete(`/api/tasks/${design.id}`);
    expect((await dto(build)).waitingOn).toEqual([]);
  });

  it('el detalle indica cuántas tareas dependen de esta', async () => {
    await link(design, build);
    expect((await dto(design)).successorCount).toBe(1);
  });

  describe('el tipo de dependencia en pasos y avisos', () => {
    it('fin a fin: marcar un paso no se bloquea y no queda «en espera»', async () => {
      const a = await ctx.makeTask(project.id, { title: 'A', status: 'IN_PROGRESS', assignees: [ana] });
      const b = await ctx.makeTask(project.id, { title: 'B', status: 'IN_PROGRESS', assignees: [ana] });
      const step = await ctx.makeStep(b.id);
      await ctx.as(pm).post(`/api/tasks/${b.id}/dependencies`, { predecessorId: a.id, type: 'FF' });
      expect((await ctx.as(ana).patch(`/api/tasks/${b.id}/steps/${step.id}`, { done: true })).statusCode).toBe(200);
      const dto = (await ctx.as(pm).get(`/api/tasks/${b.id}`)).json();
      expect(dto.waitingOn).toEqual([]);
      expect(dto.warnings).not.toContain('predecessor_not_done');
    });

    it('inicio a inicio: con la predecesora en curso no hay espera; sin empezar, sí', async () => {
      const a = await ctx.makeTask(project.id, { title: 'A', assignees: [ana] });
      const b = await ctx.makeTask(project.id, { title: 'B', assignees: [ana] });
      await ctx.as(pm).post(`/api/tasks/${b.id}/dependencies`, { predecessorId: a.id, type: 'SS' });
      expect((await ctx.as(pm).get(`/api/tasks/${b.id}`)).json().waitingOn).toEqual([{ id: a.id, title: 'A' }]);
      await ctx.prisma.task.update({ where: { id: a.id }, data: { status: 'IN_PROGRESS' } });
      expect((await ctx.as(pm).get(`/api/tasks/${b.id}`)).json().waitingOn).toEqual([]);
    });
  });
});
