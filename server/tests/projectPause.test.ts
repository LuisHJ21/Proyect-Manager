import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('pausa y reanudación de un proyecto', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  let other: Project;
  const TODAY = '2026-11-16';
  const base = () => `/api/projects/${project.id}`;
  const pause = (body: object = { reason: 'Prioridad de gerencia' }) => ctx.as(pm).post(`${base()}/pause`, body);

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ name: 'Portal', members: [ana, luis] });
    other = await ctx.makeProject({ name: 'Obra urgente', members: [ana] });
    await ctx.prisma.project.updateMany({ where: { id: { in: [project.id, other.id] } }, data: { status: 'EXECUTING', startDate: '2026-10-01', endDate: '2026-12-31' } });
  });
  afterEach(() => ctx.close());

  it('el PM pausa con motivo y no puede pausar dos veces', async () => {
    const res = await pause({ reason: 'Prioridad de gerencia', priorityProjectId: other.id });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'PAUSED' });
    const detail = (await ctx.as(pm).get(base())).json();
    expect(detail.activePause).toEqual({ pausedOn: TODAY, reason: 'Prioridad de gerencia', priorityProject: { id: other.id, name: 'Obra urgente' } });
    const again = await pause();
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('El proyecto ya está en pausa');
    const log = await ctx.prisma.activityLog.findFirst({ where: { projectId: project.id, action: 'paused' } });
    expect(log).not.toBeNull();
  });

  it('el colaborador no pausa, no reanuda ni ve el impacto, la vista previa o el historial', async () => {
    const as = ctx.as(ana);
    expect((await as.post(`${base()}/pause`, { reason: 'X' })).statusCode).toBe(403);
    expect((await as.get(`${base()}/pause-impact?priorityProjectId=${other.id}`)).statusCode).toBe(403);
    expect((await as.get(`${base()}/resume-preview`)).statusCode).toBe(403);
    expect((await as.post(`${base()}/resume`, { days: 0, createBaseline: false })).statusCode).toBe(403);
    expect((await as.get(`${base()}/pauses`)).statusCode).toBe(403);
  });

  it('el impacto muestra a las personas compartidas con sus horas', async () => {
    const own = await ctx.makeTask(project.id, { assignees: [ana], startDate: '2026-11-16', dueDate: '2026-11-20' });
    const theirs = await ctx.makeTask(other.id, { assignees: [ana], startDate: '2026-11-16', dueDate: '2026-11-20' });
    await ctx.prisma.task.update({ where: { id: own.id }, data: { estimatedHours: 10 } });
    await ctx.prisma.task.update({ where: { id: theirs.id }, data: { estimatedHours: 6 } });
    const res = await ctx.as(pm).get(`${base()}/pause-impact?priorityProjectId=${other.id}`);
    expect(res.json()).toEqual({ shared: [{ userId: ana.id, name: 'Ana', hours: [{ projectId: project.id, total: 10 }, { projectId: other.id, total: 6 }] }] });

    const lonely = await ctx.makeProject({ name: 'Sin gente' });
    await ctx.prisma.project.update({ where: { id: lonely.id }, data: { status: 'EXECUTING' } });
    expect((await ctx.as(pm).get(`${base()}/pause-impact?priorityProjectId=${lonely.id}`)).json()).toEqual({ shared: [] });

    const self = await ctx.as(pm).get(`${base()}/pause-impact?priorityProjectId=${project.id}`);
    expect(self.statusCode).toBe(400);
    expect(self.json().error.fields.priorityProjectId).toBe('Elige otro proyecto activo');
  });

  it('la vista previa propone los días en pausa y acepta otro número', async () => {
    ctx.clock.set('2026-11-01T10:00:00');
    await pause();
    ctx.clock.set(`${TODAY}T10:00:00`);
    await ctx.makeTask(project.id, { title: 'Diseño', status: 'TODO', startDate: '2026-11-20', dueDate: '2026-11-25' });
    const preview = (await ctx.as(pm).get(`${base()}/resume-preview`)).json();
    expect(preview).toMatchObject({ proposedDays: 15, days: 15, hasBaseline: false });
    expect(preview.changes.tasks[0]).toMatchObject({ name: 'Diseño', to: { startDate: '2026-12-05', dueDate: '2026-12-10' } });
    const three = (await ctx.as(pm).get(`${base()}/resume-preview?days=3`)).json();
    expect(three).toMatchObject({ proposedDays: 15, days: 3 });
    expect(three.changes.endDate).toEqual({ from: '2026-12-31', to: '2027-01-03' });
  });

  it('reanudar corre lo pendiente, vuelve al estado anterior y fija una línea base', async () => {
    const todo = await ctx.makeTask(project.id, { status: 'TODO', startDate: '2026-11-01', dueDate: '2026-11-05' });
    const doing = await ctx.makeTask(project.id, { status: 'IN_PROGRESS', startDate: '2026-11-01', dueDate: '2026-11-05' });
    const done = await ctx.makeTask(project.id, { status: 'DONE', progress: 100, startDate: '2026-10-01', dueDate: '2026-10-05' });
    await ctx.prisma.task.update({ where: { id: todo.id }, data: { plannedCostCents: 100000 } });
    const milestone = await ctx.prisma.milestone.create({ data: { projectId: project.id, name: 'Entrega', dueDate: '2026-11-20' } });
    expect((await ctx.as(pm).post(`${base()}/baselines`, { reason: 'Inicial' })).statusCode).toBe(201);
    await pause({ reason: 'Prioridad de gerencia' });

    const res = await ctx.as(pm).post(`${base()}/resume`, { days: 10, createBaseline: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'EXECUTING', endDate: '2027-01-10' });
    const task = (id: string) => ctx.prisma.task.findUniqueOrThrow({ where: { id } });
    expect(await task(todo.id)).toMatchObject({ startDate: '2026-11-11', dueDate: '2026-11-15', version: 2 });
    expect(await task(doing.id)).toMatchObject({ startDate: '2026-11-01', dueDate: '2026-11-15' });
    expect(await task(done.id)).toMatchObject({ startDate: '2026-10-01', dueDate: '2026-10-05', version: 1 });
    expect(await ctx.prisma.milestone.findUniqueOrThrow({ where: { id: milestone.id } })).toMatchObject({ dueDate: '2026-11-30' });
    const baselines = await ctx.prisma.baseline.findMany({ where: { projectId: project.id }, orderBy: { version: 'asc' } });
    expect(baselines.map((b) => b.reason)).toEqual(['Inicial', 'Reanudación tras pausa: Prioridad de gerencia']);
    const history = (await ctx.as(pm).get(`${base()}/pauses`)).json();
    expect(history).toEqual([{ pausedOn: TODAY, resumedOn: TODAY, reason: 'Prioridad de gerencia', shiftDays: 10, priorityProject: null }]);
    expect((await ctx.as(pm).get(base())).json().activePause).toBeNull();
    expect(await ctx.prisma.activityLog.count({ where: { projectId: project.id, action: 'resumed' } })).toBe(1);
  });

  it('reanudar dos veces no corre el cronograma dos veces', async () => {
    const todo = await ctx.makeTask(project.id, { status: 'TODO', startDate: '2026-11-01', dueDate: '2026-11-05' });
    await pause();
    const results = await Promise.all([
      ctx.as(pm).post(`${base()}/resume`, { days: 5, createBaseline: false }),
      ctx.as(pm).post(`${base()}/resume`, { days: 5, createBaseline: false }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error.message).toBe('El proyecto no está en pausa');
    expect(await ctx.prisma.task.findUniqueOrThrow({ where: { id: todo.id } })).toMatchObject({ startDate: '2026-11-06', dueDate: '2026-11-10' });
  });

  it('un proyecto pausado antes de esta etapa se reanuda sin corrimiento', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'PAUSED' } });
    expect((await ctx.as(pm).get(`${base()}/resume-preview`)).json()).toMatchObject({ proposedDays: 0 });
    const res = await ctx.as(pm).post(`${base()}/resume`, { days: 0, createBaseline: false });
    expect(res.json()).toMatchObject({ status: 'EXECUTING' });
    expect(await ctx.prisma.projectPause.findMany({ where: { projectId: project.id } })).toEqual([
      expect.objectContaining({ pausedOn: null, resumedOn: TODAY, shiftDays: 0, previousStatus: 'EXECUTING' }),
    ]);
    const notPaused = await ctx.as(pm).get(`${base()}/resume-preview`);
    expect(notPaused.statusCode).toBe(409);
  });

  it('el colaborador ajeno al proyecto prioritario no recibe su nombre', async () => {
    await pause({ reason: 'Prioridad de gerencia', priorityProjectId: other.id });
    expect((await ctx.as(luis).get(base())).json().activePause).toEqual({ pausedOn: TODAY, reason: 'Prioridad de gerencia', priorityProject: null });
    expect((await ctx.as(ana).get(base())).json().activePause.priorityProject).toEqual({ id: other.id, name: 'Obra urgente' });
  });

  it('el formulario no entra ni sale de la pausa, pero edita un proyecto pausado', async () => {
    const toPaused = await ctx.as(pm).patch(base(), { status: 'PAUSED' });
    expect(toPaused.statusCode).toBe(400);
    expect(toPaused.json().error.fields.status).toBe('Usa Pausar o Reanudar proyecto');
    await pause();
    expect((await ctx.as(pm).patch(base(), { name: 'Portal nuevo', status: 'PAUSED' })).statusCode).toBe(200);
    const out = await ctx.as(pm).patch(base(), { status: 'EXECUTING' });
    expect(out.statusCode).toBe(400);
    expect(out.json().error.fields.status).toBe('Usa Pausar o Reanudar proyecto');
  });
});
