import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('entregables para colaborador y observador', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let olga: User;
  let project: Project;
  let id: string;
  const base = () => `/api/projects/${project.id}/deliverables`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    project = await ctx.makeProject({ members: [ana, olga] });
    const stakeholder = await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'María Pérez' } });
    id = (await ctx.as(pm).post(base(), { name: 'Portal', criteria: ['Funciona en móvil'] })).json().id;
    await ctx.as(pm).patch(`${base()}/${id}`, { status: 'IN_REVIEW' });
    const review = await ctx.as(pm).post(`${base()}/${id}/reviews`, {
      outcome: 'REJECTED',
      note: 'Falta el manual',
      reviewedOn: '2026-11-10',
      stakeholderId: stakeholder.id,
    });
    expect(review.statusCode).toBe(200);
  });
  afterEach(() => ctx.close());

  for (const who of ['colaborador', 'observador'] as const) {
    it(`el ${who} lee lista y detalle sin el nombre de quien revisó`, async () => {
      const viewer = who === 'colaborador' ? ana : olga;
      const list = await ctx.as(viewer).get(base());
      expect(list.statusCode).toBe(200);
      expect(list.json()[0].lastReview).toEqual({ outcome: 'REJECTED', reviewedOn: '2026-11-10' });
      const detail = await ctx.as(viewer).get(`${base()}/${id}`);
      expect(detail.statusCode).toBe(200);
      const body = detail.json();
      expect(body.criteria.map((c: { text: string }) => c.text)).toEqual(['Funciona en móvil']);
      expect(body.reviews[0]).toMatchObject({ outcome: 'REJECTED', reviewedOn: '2026-11-10', note: 'Falta el manual' });
      expect(body.reviews[0]).not.toHaveProperty('stakeholder');
      expect(body.reviews[0]).not.toHaveProperty('stakeholderName');
      expect(body.lastReview).not.toHaveProperty('stakeholderName');
      expect(list.body + detail.body).not.toContain('María Pérez');
    });
  }

  it('el PM sigue viendo quién revisó', async () => {
    const body = (await ctx.as(pm).get(`${base()}/${id}`)).json();
    expect(body.reviews[0].stakeholder.name).toBe('María Pérez');
    expect(body.lastReview.stakeholderName).toBe('María Pérez');
  });

  it('el colaborador no escribe en entregables', async () => {
    const detail = (await ctx.as(pm).get(`${base()}/${id}`)).json();
    expect((await ctx.as(ana).post(base(), { name: 'Otro' })).statusCode).toBe(403);
    expect((await ctx.as(ana).patch(`${base()}/${id}/criteria/${detail.criteria[0].id}`, { met: true })).statusCode).toBe(403);
    expect((await ctx.as(ana).post(`${base()}/${id}/reviews`, { outcome: 'REJECTED', note: 'X', reviewedOn: '2026-11-11' })).statusCode).toBe(403);
  });
});
