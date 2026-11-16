import type { Deliverable, Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('defectos y no conformidades', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  let portal: Deliverable;
  const TODAY = '2026-11-16';
  const incidents = () => `/api/projects/${project.id}/incidents`;
  const review = (body: object) => ctx.as(pm).post(`/api/projects/${project.id}/deliverables/${portal.id}/reviews`, { reviewedOn: TODAY, ...body });

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set(`${TODAY}T10:00:00`);
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs] });
    portal = await ctx.prisma.deliverable.create({ data: { projectId: project.id, number: 1, name: 'Portal web', status: 'IN_REVIEW' } });
  });
  afterEach(() => ctx.close());

  it('el PM fija tipo y entregable, y la lista filtra por tipo', async () => {
    const defect = await ctx.as(pm).post(incidents(), { title: 'Botón roto', kind: 'DEFECT', deliverableId: portal.id });
    expect(defect.statusCode).toBe(201);
    expect(defect.json()).toMatchObject({ kind: 'DEFECT', deliverable: { id: portal.id, number: 1, name: 'Portal web' } });
    expect(defect.json()).not.toHaveProperty('deliverableId');
    await ctx.as(pm).post(incidents(), { title: 'Caída del servidor' });
    const filtered = (await ctx.as(pm).get(`${incidents()}?kind=DEFECT`)).json();
    expect(filtered.map((i: { title: string }) => i.title)).toEqual(['Botón roto']);
    const plain = (await ctx.as(pm).get(`${incidents()}?kind=INCIDENT`)).json();
    expect(plain.map((i: { kind: string }) => i.kind)).toEqual(['INCIDENT']);
  });

  it('un entregable de otro proyecto da 400 y el colaborador no fija el tipo', async () => {
    const other = await ctx.makeProject();
    const foreign = await ctx.prisma.deliverable.create({ data: { projectId: other.id, number: 1, name: 'Ajeno' } });
    const bad = await ctx.as(pm).post(incidents(), { title: 'X', deliverableId: foreign.id });
    expect(bad.statusCode).toBe(400);
    expect(JSON.stringify(bad.json())).toContain('El entregable no pertenece a este proyecto');
    expect((await ctx.as(ana).post(incidents(), { title: 'Y', kind: 'DEFECT' })).statusCode).toBe(403);
    const reported = await ctx.as(ana).post(incidents(), { title: 'Y' });
    expect(reported.json().kind).toBe('INCIDENT');
  });

  it('rechazar con no conformidad crea el incidente ligado', async () => {
    const res = await review({ outcome: 'REJECTED', note: 'No carga en móvil', nonconformity: { title: 'No conformidad: Portal web' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('REJECTED');
    expect(body.nonconformity).toEqual({ id: expect.any(String), number: 1 });
    const incident = await ctx.prisma.incident.findUniqueOrThrow({ where: { id: body.nonconformity.id } });
    expect(incident).toMatchObject({ kind: 'NONCONFORMITY', deliverableId: portal.id, priority: 'HIGH', reportedById: pm.id, title: 'No conformidad: Portal web', description: '<p>No carga en móvil</p>' });
    const detail = (await ctx.as(pm).get(`/api/projects/${project.id}/deliverables/${portal.id}`)).json();
    expect(detail.incidents).toEqual([{ id: incident.id, number: 1, title: 'No conformidad: Portal web', kind: 'NONCONFORMITY', status: 'OPEN' }]);
  });

  it('un rechazo que falla no crea la no conformidad, y aceptar con ella da 400', async () => {
    const noNote = await review({ outcome: 'REJECTED', note: '', nonconformity: { title: 'NC' } });
    expect(noNote.statusCode).toBe(400);
    const accepted = await review({ outcome: 'ACCEPTED', nonconformity: { title: 'NC' } });
    expect(accepted.statusCode).toBe(400);
    expect(await ctx.prisma.incident.count()).toBe(0);
    const plain = await review({ outcome: 'REJECTED', note: 'Falta el logo' });
    expect(plain.json().nonconformity).toBeNull();
    expect(await ctx.prisma.incident.count()).toBe(0);
  });

  it('el detalle del entregable muestra incidentes según quién mira', async () => {
    await ctx.as(pm).post(incidents(), { title: 'Del PM', kind: 'DEFECT', deliverableId: portal.id });
    const mine = await ctx.prisma.incident.create({ data: { projectId: project.id, number: 9, title: 'De Ana', reportedById: ana.id, deliverableId: portal.id } });
    const detailOf = async (user: User) => (await ctx.as(user).get(`/api/projects/${project.id}/deliverables/${portal.id}`)).json();
    expect((await detailOf(pm)).incidents).toHaveLength(2);
    expect((await detailOf(ana)).incidents.map((i: { id: string }) => i.id)).toEqual([mine.id]);
    expect(await detailOf(obs)).not.toHaveProperty('incidents');
  });
});
