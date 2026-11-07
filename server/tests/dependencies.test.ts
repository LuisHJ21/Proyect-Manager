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

  it('una fecha de inicio anterior a la límite de la predecesora guarda y advierte', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-05' });
    const res = await link(a, b);
    expect(res.statusCode).toBe(201);
    expect(res.json().warnings).toContain('starts_before_predecessor_due');
  });

  it('empezar el mismo día de la fecha límite no advierte', async () => {
    const a = await ctx.makeTask(project.id, { dueDate: '2026-12-10' });
    const b = await ctx.makeTask(project.id, { startDate: '2026-12-10' });
    expect((await link(a, b)).json().warnings).toEqual([]);
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
});
