import type { Project, Requirement, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('solicitudes de cambio que citan requisitos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let req1: Requirement;
  let req2: Requirement;
  const url = () => `/api/projects/${project.id}/change-requests`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    project = await ctx.makeProject({ members: [ana] });
    req1 = await ctx.prisma.requirement.create({ data: { projectId: project.id, number: 1, description: 'Acceso' } });
    req2 = await ctx.prisma.requirement.create({ data: { projectId: project.id, number: 2, description: 'Reportes' } });
  });
  afterEach(() => ctx.close());

  it('el PM cita requisitos al crear y los reemplaza al editar', async () => {
    const created = await ctx.as(pm).post(url(), { title: 'Cambiar login', requirementIds: [req2.id, req1.id, req1.id] });
    expect(created.statusCode).toBe(201);
    expect(created.json().requirements).toEqual([
      { id: req1.id, number: 1 },
      { id: req2.id, number: 2 },
    ]);
    const edited = await ctx.as(pm).patch(`${url()}/${created.json().id}`, { requirementIds: [req2.id] });
    expect(edited.json().requirements).toEqual([{ id: req2.id, number: 2 }]);
    const listed = (await ctx.as(pm).get(url())).json()[0];
    expect(listed.requirements).toEqual([{ id: req2.id, number: 2 }]);
  });

  it('el colaborador propone citando un requisito', async () => {
    const res = await ctx.as(ana).post(url(), { title: 'Agregar blog', requirementIds: [req1.id] });
    expect(res.statusCode).toBe(201);
    expect(res.json().requirements).toEqual([{ id: req1.id, number: 1 }]);
    expect((await ctx.as(ana).get(url())).json()[0].requirements).toEqual([{ id: req1.id, number: 1 }]);
  });

  it('un requisito de otro proyecto da 400 y no crea nada', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.prisma.requirement.create({ data: { projectId: other.id, number: 1, description: 'Ajeno' } });
    for (const user of [pm, ana]) {
      const res = await ctx.as(user).post(url(), { title: 'X', requirementIds: [foreign.id] });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain('El requisito no pertenece a este proyecto');
    }
    expect(await ctx.prisma.changeRequest.count()).toBe(0);
  });
});
