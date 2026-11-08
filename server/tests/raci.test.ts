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

  describe('celdas', () => {
    let activity: { id: string };
    let mario: { id: string };
    const put = (body: object) => ctx.as(pm).put(`${base()}/cells`, { activityId: activity.id, ...body });
    beforeEach(async () => {
      activity = await createActivity('Diseño');
      mario = await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Mario' } });
    });

    it('colaborador 403 y no miembro 404', async () => {
      const outsider = await ctx.makeUser({ role: 'COLLABORATOR' });
      const cell = { activityId: activity.id, kind: 'member', partyId: ana.id, role: 'R' };
      expect((await ctx.as(ana).put(`${base()}/cells`, cell)).statusCode).toBe(403);
      expect((await ctx.as(outsider).put(`${base()}/cells`, cell)).statusCode).toBe(404);
    });

    it('asignar A y R deja la fila Completa', async () => {
      expect((await put({ kind: 'member', partyId: ana.id, role: 'A' })).statusCode).toBe(200);
      await put({ kind: 'stakeholder', partyId: mario.id, role: 'R' });
      const body = (await ctx.as(pm).get(base())).json();
      expect(body.activities[0].warnings).toEqual([]);
      expect(body.cells).toEqual(
        expect.arrayContaining([
          { activityId: activity.id, kind: 'member', partyId: ana.id, role: 'A' },
          { activityId: activity.id, kind: 'stakeholder', partyId: mario.id, role: 'R' },
        ]),
      );
      expect(body.cells).toHaveLength(2);
    });

    it('cambiar R por A no duplica la celda', async () => {
      await put({ kind: 'member', partyId: ana.id, role: 'R' });
      await put({ kind: 'member', partyId: ana.id, role: 'A' });
      const cells = await ctx.prisma.raciCell.findMany();
      expect(cells).toHaveLength(1);
      expect(cells[0].role).toBe('A');
    });

    it('role null vacía la celda, aunque no exista', async () => {
      await put({ kind: 'stakeholder', partyId: mario.id, role: 'C' });
      expect((await put({ kind: 'stakeholder', partyId: mario.id, role: null })).statusCode).toBe(200);
      expect(await ctx.prisma.raciCell.count()).toBe(0);
      expect((await put({ kind: 'stakeholder', partyId: mario.id, role: null })).statusCode).toBe(200);
    });

    it('participante ajeno responde 400 en partyId', async () => {
      const stranger = await ctx.makeUser({ role: 'COLLABORATOR' });
      const other = await ctx.makeProject();
      const foreign = await ctx.prisma.stakeholder.create({ data: { projectId: other.id, name: 'Ajeno' } });
      for (const body of [
        { kind: 'member', partyId: stranger.id, role: 'R' },
        { kind: 'stakeholder', partyId: foreign.id, role: 'R' },
        { kind: 'member', partyId: mario.id, role: 'R' },
      ]) {
        const res = await put(body);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.fields.partyId).toBeTruthy();
      }
    });

    it('rol inválido responde 400 en role', async () => {
      const res = await put({ kind: 'member', partyId: ana.id, role: 'X' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.role).toBeTruthy();
    });

    it('actividad de otro proyecto responde 404', async () => {
      const other = await ctx.makeProject();
      const foreign = await createActivity('Ajena', other.id);
      const res = await ctx.as(pm).put(`${base()}/cells`, { activityId: foreign.id, kind: 'member', partyId: ana.id, role: 'R' });
      expect(res.statusCode).toBe(404);
    });

    it('eliminar la actividad borra sus celdas', async () => {
      await put({ kind: 'member', partyId: ana.id, role: 'R' });
      await ctx.as(pm).delete(`${base()}/activities/${activity.id}`);
      expect(await ctx.prisma.raciCell.count()).toBe(0);
    });

    it('eliminar el interesado borra sus celdas', async () => {
      await put({ kind: 'stakeholder', partyId: mario.id, role: 'I' });
      expect((await ctx.as(pm).delete(`/api/projects/${project.id}/stakeholders/${mario.id}`)).statusCode).toBe(200);
      expect(await ctx.prisma.raciCell.count()).toBe(0);
    });

    it('quitar a un miembro borra sus celdas solo en ese proyecto, e impact las informa', async () => {
      const second = await ctx.makeProject({ members: [ana] });
      const secondActivity = await createActivity('Otra', second.id);
      await ctx.as(pm).put(`${base(second.id)}/cells`, { activityId: secondActivity.id, kind: 'member', partyId: ana.id, role: 'R' });
      await put({ kind: 'member', partyId: ana.id, role: 'A' });
      const extra = await createActivity('Pruebas');
      await ctx.as(pm).put(`${base()}/cells`, { activityId: extra.id, kind: 'member', partyId: ana.id, role: 'C' });
      const impact = (await ctx.as(pm).get(`/api/projects/${project.id}/members/${ana.id}/impact`)).json();
      expect(impact.raciCells).toBe(2);
      await ctx.as(pm).delete(`/api/projects/${project.id}/members/${ana.id}`);
      const left = await ctx.prisma.raciCell.findMany();
      expect(left).toHaveLength(1);
      expect(left[0].activityId).toBe(secondActivity.id);
    });
  });

  it('borrar el proyecto borra sus actividades', async () => {
    await createActivity('Diseño');
    await ctx.as(pm).delete(`/api/projects/${project.id}`, { confirmName: project.name });
    expect(await ctx.prisma.raciActivity.count()).toBe(0);
  });
});
