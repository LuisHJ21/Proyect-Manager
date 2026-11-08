import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('matriz RACI', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  const base = (id = project.id) => `/api/projects/${id}/raci`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  const createActivity = async (title: string, projectId = project.id) =>
    (await ctx.as(pm).post(`${base(projectId)}/activities`, { title })).json();

  it('colaborador 403 y no miembro 404', async () => {
    const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(ana).get(base())).statusCode).toBe(403);
    expect((await ctx.as(ana).post(`${base()}/activities`, { title: 'X' })).statusCode).toBe(403);
    expect((await ctx.as(outsider).get(base())).statusCode).toBe(404);
    expect((await ctx.as(outsider).post(`${base()}/activities`, { title: 'X' })).statusCode).toBe(404);
  });

  it('crea, edita y elimina actividades en orden de creación', async () => {
    const created = await ctx.as(pm).post(`${base()}/activities`, { title: 'Diseño' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ title: 'Diseño', description: '' });
    ctx.clock.set('2026-11-08T10:00:00');
    await createActivity('Pruebas');
    const patched = await ctx.as(pm).patch(`${base()}/activities/${created.json().id}`, { title: 'Diseño final', description: 'Pantallas' });
    expect(patched.json()).toMatchObject({ title: 'Diseño final', description: 'Pantallas' });
    const body = (await ctx.as(pm).get(base())).json();
    expect(body.activities.map((a: { title: string }) => a.title)).toEqual(['Diseño final', 'Pruebas']);
    expect(body.activities[0].warnings).toEqual(['missing_a', 'missing_r']);
    expect((await ctx.as(pm).delete(`${base()}/activities/${created.json().id}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).get(base())).json().activities).toHaveLength(1);
  });

  it('un título vacío responde 400 en title', async () => {
    const res = await ctx.as(pm).post(`${base()}/activities`, { title: '  ' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.title).toBeTruthy();
  });

  it('una actividad de otro proyecto responde 404', async () => {
    const other = await ctx.makeProject();
    const foreign = await createActivity('Ajena', other.id);
    expect((await ctx.as(pm).patch(`${base()}/activities/${foreign.id}`, { title: 'X' })).statusCode).toBe(404);
    expect((await ctx.as(pm).delete(`${base()}/activities/${foreign.id}`)).statusCode).toBe(404);
  });

  it('GET agrupa miembros e interesados en orden alfabético', async () => {
    const zoe = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Zoe' });
    await ctx.prisma.projectMember.create({ data: { projectId: project.id, userId: zoe.id } });
    await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Mario' } });
    await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Beto' } });
    const body = (await ctx.as(pm).get(base())).json();
    expect(body.members).toEqual([
      { id: ana.id, name: 'Ana' },
      { id: zoe.id, name: 'Zoe' },
    ]);
    expect(body.stakeholders.map((s: { name: string }) => s.name)).toEqual(['Beto', 'Mario']);
    expect(body.cells).toEqual([]);
  });

  it('borrar el proyecto borra sus actividades', async () => {
    await createActivity('Diseño');
    await ctx.as(pm).delete(`/api/projects/${project.id}`, { confirmName: project.name });
    expect(await ctx.prisma.raciActivity.count()).toBe(0);
  });
});
