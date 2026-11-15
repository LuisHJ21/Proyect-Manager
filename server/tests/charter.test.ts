import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const complete = { justification: 'J', scopeIncluded: 'A', successCriteria: 'C' };

describe('acta', () => {
  let ctx: TestCtx;
  let pm: User;
  let member: User;
  let project: Project;
  let url: string;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    member = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [member] });
    url = `/api/projects/${project.id}/charter`;
  });
  afterEach(() => ctx.close());
  const current = async () => (await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } })).version;
  const save = async (body: object) => ctx.as(pm).put(url, { ...body, version: await current() });
  const approve = async () => ctx.as(pm).post(`${url}/approve`, { version: await current() });

  it('no aprueba sin justificación, alcance incluido y criterios de éxito', async () => {
    const res = await approve();
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().error.fields).sort()).toEqual(['justification', 'scopeIncluded', 'successCriteria']);
  });

  it('un campo con solo espacios no cuenta como completo', async () => {
    await save({ ...complete, justification: '   ' });
    const res = await approve();
    expect(Object.keys(res.json().error.fields)).toEqual(['justification']);
  });

  it('aprobar registra approvedById y approvedAt', async () => {
    await save(complete);
    ctx.clock.set('2026-11-06T09:00:00');
    const res = await approve();
    expect(res.json().status).toBe('APPROVED');
    expect(res.json().approvedById).toBe(pm.id);
    expect(res.json().approvedBy.name).toBe(pm.name);
    expect(new Date(res.json().approvedAt).getHours()).toBe(9);
  });

  it('editar un acta aprobada la devuelve a DRAFT y borra la aprobación', async () => {
    await save(complete);
    await approve();
    const res = await save({ ...complete, sponsor: 'Dirección' });
    expect(res.json().status).toBe('DRAFT');
    expect(res.json().approvedById).toBeNull();
    expect(res.json().approvedAt).toBeNull();
  });

  it('guardar sin cambios conserva la aprobación', async () => {
    await save(complete);
    await approve();
    expect((await save(complete)).json().status).toBe('APPROVED');
  });

  it('colaborador miembro lee el acta y recibe 403 al editar', async () => {
    expect((await ctx.as(member).get(url)).statusCode).toBe(200);
    expect((await ctx.as(member).put(url, complete)).statusCode).toBe(403);
    expect((await ctx.as(member).post(`${url}/approve`)).statusCode).toBe(403);
  });

  describe('versión del acta', () => {
    const conflict = 'Otra persona guardó cambios en este registro mientras editabas';
    const version = async () => (await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } })).version;

    it('guardar con la versión actual la sube en 1', async () => {
      const res = await ctx.as(pm).put(url, { ...complete, version: 1 });
      expect(res.statusCode).toBe(200);
      expect(res.json().version).toBe(2);
    });

    it('guardar con versión vieja responde 409 y no cambia nada', async () => {
      await ctx.as(pm).put(url, { ...complete, version: 1 });
      const res = await ctx.as(pm).put(url, { ...complete, sponsor: 'Otro', version: 1 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'edit_conflict', message: conflict });
      const row = await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } });
      expect(row).toMatchObject({ sponsor: '', version: 2 });
    });

    it('sin versión responde 400 en el campo version', async () => {
      const res = await ctx.as(pm).put(url, complete);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields.version).toBe('Recarga la página para editar este registro');
    });

    it('sin cambios de contenido y versión vieja responde 200 sin escribir', async () => {
      await ctx.as(pm).put(url, { ...complete, version: 1 });
      const res = await ctx.as(pm).put(url, { ...complete, version: 1 });
      expect(res.statusCode).toBe(200);
      expect(await version()).toBe(2);
    });

    it('aprobar con versión vieja responde 409 y no aprueba', async () => {
      await ctx.as(pm).put(url, { ...complete, version: 1 });
      const res = await ctx.as(pm).post(`${url}/approve`, { version: 1 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('edit_conflict');
      expect((await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } })).status).toBe('DRAFT');
    });

    it('aprobar con la versión actual aprueba y sube la versión', async () => {
      await ctx.as(pm).put(url, { ...complete, version: 1 });
      const res = await ctx.as(pm).post(`${url}/approve`, { version: 2 });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'APPROVED', version: 3 });
    });

    it('en un proyecto cerrado responde project_closed antes que el choque', async () => {
      await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
      const res = await ctx.as(pm).put(url, { ...complete, version: 7 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('project_closed');
    });
  });
});
