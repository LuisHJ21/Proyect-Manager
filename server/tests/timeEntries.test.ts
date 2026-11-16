import type { Project, Task, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('registro de horas', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let olga: User;
  let project: Project;
  let task: Task;
  const url = (id = task.id) => `/api/tasks/${id}/time-entries`;
  const TODAY = '2026-11-16';

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    olga = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, beto, olga] });
    await ctx.prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: ana.id } }, data: { hourlyRateCents: 2000n } });
    task = await ctx.makeTask(project.id, { title: 'Construcción', assignees: [ana] });
  });
  afterEach(() => ctx.close());

  const log = (user: User, body: object = {}) => ctx.as(user).post(url(), { date: TODAY, hours: 2.5, note: 'Muros', ...body });

  it('la responsable registra sin ver costos; el PM ve tarifa y costo', async () => {
    const res = await log(ana);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ date: TODAY, hours: 2.5, note: 'Muros', user: { id: ana.id, name: 'Ana' } });
    expect(res.json()).not.toHaveProperty('rateCents');
    expect(res.json()).not.toHaveProperty('costCents');
    const [entry] = (await ctx.as(pm).get(url())).json();
    expect(entry).toMatchObject({ hours: 2.5, rateCents: 2000, costCents: 5000 });
  });

  it('quien no es responsable no registra pero ve la lista sin costos; el observador no la ve', async () => {
    await log(ana);
    expect((await log(beto)).statusCode).toBe(403);
    const list = (await ctx.as(beto).get(url())).json();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('costCents');
    expect((await ctx.as(olga).get(url())).statusCode).toBe(403);
  });

  it('valida fecha y horas', async () => {
    const future = await log(ana, { date: '2026-11-17' });
    expect(future.statusCode).toBe(400);
    expect(future.json().error.fields.date).toBe('No se registran horas futuras');
    expect((await log(ana, { hours: 0.1 })).statusCode).toBe(400);
    expect((await log(ana, { hours: 25 })).statusCode).toBe(400);
  });

  it('una tarea con subtareas no recibe horas', async () => {
    const parent = await ctx.makeTask(project.id, { title: 'Fase' });
    await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Hija', parentId: parent.id } });
    const res = await ctx.as(pm).post(url(parent.id), { date: TODAY, hours: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('task_is_summary');
  });

  it('cada quien edita o borra las suyas; el PM cualquiera', async () => {
    const entry = (await log(ana)).json();
    expect((await ctx.as(ana).patch(`${url()}/${entry.id}`, { hours: 3 })).statusCode).toBe(200);
    expect((await ctx.as(beto).patch(`${url()}/${entry.id}`, { hours: 1 })).statusCode).toBe(403);
    expect((await ctx.as(beto).delete(`${url()}/${entry.id}`)).statusCode).toBe(403);
    expect((await ctx.as(pm).delete(`${url()}/${entry.id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
  });

  it('cambiar la tarifa no cambia el costo de lo ya registrado', async () => {
    await log(ana);
    const res = await ctx.as(pm).patch(`/api/projects/${project.id}/members/${ana.id}`, { hourlyRateCents: 3000 });
    expect(res.statusCode).toBe(200);
    await ctx.as(ana).patch(`${url()}/${(await ctx.prisma.timeEntry.findFirstOrThrow()).id}`, { hours: 4 });
    const [entry] = (await ctx.as(pm).get(url())).json();
    expect(entry).toMatchObject({ rateCents: 2000, costCents: 8000 });
  });

  it('miembros: la capacidad la ven todos y la tarifa solo el PM', async () => {
    const asAna = (await ctx.as(ana).get(`/api/projects/${project.id}/members`)).json();
    expect(asAna[0]).toHaveProperty('weeklyCapacityHours', 40);
    expect(asAna.every((m: object) => !('hourlyRateCents' in m))).toBe(true);
    const asPm = (await ctx.as(pm).get(`/api/projects/${project.id}/members`)).json();
    expect(asPm.find((m: { userId: string }) => m.userId === ana.id)).toMatchObject({ hourlyRateCents: 2000, weeklyCapacityHours: 40 });
    expect((await ctx.as(ana).patch(`/api/projects/${project.id}/members/${ana.id}`, { hourlyRateCents: 1 })).statusCode).toBe(403);
  });

  it('horas estimadas: una padre no las admite y resume las de sus hojas', async () => {
    const parent = await ctx.makeTask(project.id, { title: 'Fase' });
    for (const hours of [3, 5]) {
      const res = await ctx.as(pm).post(`/api/projects/${project.id}/tasks`, { title: `H${hours}`, parentId: parent.id, estimatedHours: hours });
      expect(res.statusCode).toBe(201);
    }
    const p = (await ctx.as(pm).get(`/api/tasks/${parent.id}`)).json();
    expect(p.estimatedHours).toBe(8);
    const bad = await ctx.as(pm).patch(`/api/tasks/${parent.id}`, { estimatedHours: 2, version: p.version });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.estimatedHours).toBe('Se calcula con sus subtareas');
  });

  it('registrar horas queda en la bitácora como edición de la tarea', async () => {
    await log(ana);
    const entries = await ctx.prisma.activityLog.findMany();
    expect(entries.map((e) => e.action)).toEqual(['updated']);
  });
});
