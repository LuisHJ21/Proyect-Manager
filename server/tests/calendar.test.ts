import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const URL = '/api/calendar?from=2026-11-01&to=2026-11-30';
const titles = (items: { title: string }[]) => items.map((i) => i.title).sort();

describe('GET /api/calendar', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let beto: User;
  let mine: Project;
  let other: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    beto = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Beto' });
    mine = await ctx.makeProject({ name: 'Mío', members: [ana, beto] });
    other = await ctx.makeProject({ name: 'Ajeno', members: [beto] });
    await ctx.makeTask(mine.id, { title: 'De Ana', assignees: [ana], dueDate: '2026-11-10' });
    await ctx.makeTask(mine.id, { title: 'De Beto', assignees: [beto], dueDate: '2026-11-11' });
    await ctx.makeTask(other.id, { title: 'Ajena', assignees: [beto], dueDate: '2026-11-12' });
    await ctx.prisma.milestone.create({ data: { projectId: mine.id, name: 'Hito mío', dueDate: '2026-11-15' } });
    await ctx.prisma.milestone.create({ data: { projectId: other.id, name: 'Hito ajeno', dueDate: '2026-11-16' } });
  });
  afterEach(() => ctx.close());

  it('PM ve tareas e hitos de todos los proyectos activos', async () => {
    const body = (await ctx.as(pm).get(URL)).json();
    expect(titles(body.tasks)).toEqual(['Ajena', 'De Ana', 'De Beto']);
    expect(body.milestones.map((m: { name: string }) => m.name).sort()).toEqual(['Hito ajeno', 'Hito mío']);
    expect(body.tasks[0]).toHaveProperty('projectName');
    expect(body.tasks.find((t: { title: string }) => t.title === 'De Ana').assignees).toEqual([{ id: ana.id, name: 'Ana' }]);
  });

  it('colaborador ve solo sus tareas e hitos de sus proyectos', async () => {
    const body = (await ctx.as(ana).get(URL)).json();
    expect(titles(body.tasks)).toEqual(['De Ana']);
    expect(body.milestones.map((m: { name: string }) => m.name)).toEqual(['Hito mío']);
  });

  it('excluye proyectos cerrados y cancelados', async () => {
    await ctx.prisma.project.update({ where: { id: other.id }, data: { status: 'CLOSED' } });
    await ctx.prisma.project.update({ where: { id: mine.id }, data: { status: 'CANCELLED' } });
    const body = (await ctx.as(pm).get(URL)).json();
    expect(body.tasks).toEqual([]);
    expect(body.milestones).toEqual([]);
  });

  it('incluye los extremos del rango y usa solo la fecha límite', async () => {
    await ctx.makeTask(mine.id, { title: 'Primer día', dueDate: '2026-11-01' });
    await ctx.makeTask(mine.id, { title: 'Último día', dueDate: '2026-11-30' });
    await ctx.makeTask(mine.id, { title: 'Después', dueDate: '2026-12-01' });
    await ctx.makeTask(mine.id, { title: 'Empieza dentro', startDate: '2026-11-05', dueDate: '2026-12-20' });
    const found = titles((await ctx.as(pm).get(URL)).json().tasks);
    expect(found).toContain('Primer día');
    expect(found).toContain('Último día');
    expect(found).not.toContain('Después');
    expect(found).not.toContain('Empieza dentro');
  });

  it('undated: solo abiertas sin fecha, del alcance del usuario y sin depender del rango', async () => {
    await ctx.makeTask(mine.id, { title: 'Sin fecha de Ana', assignees: [ana] });
    await ctx.makeTask(mine.id, { title: 'Sin fecha terminada', assignees: [ana], status: 'DONE' });
    await ctx.makeTask(mine.id, { title: 'Sin fecha de Beto', assignees: [beto] });
    const body = (await ctx.as(ana).get('/api/calendar?from=2030-01-01&to=2030-01-31')).json();
    expect(titles(body.undated)).toEqual(['Sin fecha de Ana']);
    expect(titles((await ctx.as(pm).get(URL)).json().undated)).toEqual(['Sin fecha de Ana', 'Sin fecha de Beto']);
  });

  it.each([
    ['2026-11-30', '2026-11-01'],
    ['2026-01-01', '2026-04-01'],
    ['x', '2026-01-01'],
  ])('rango inválido %s..%s responde 400', async (from, to) => {
    expect((await ctx.as(pm).get(`/api/calendar?from=${from}&to=${to}`)).statusCode).toBe(400);
  });

  it('sin fechas responde 400 por campo', async () => {
    const res = await ctx.as(pm).get('/api/calendar');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.from).toBeTruthy();
  });

  it('62 días se aceptan y 63 no', async () => {
    expect((await ctx.as(pm).get('/api/calendar?from=2026-01-01&to=2026-03-03')).statusCode).toBe(200);
    expect((await ctx.as(pm).get('/api/calendar?from=2026-01-01&to=2026-03-04')).statusCode).toBe(400);
  });

  it('anónimo recibe 401', async () => {
    expect((await ctx.anon.get(URL)).statusCode).toBe(401);
  });
});
