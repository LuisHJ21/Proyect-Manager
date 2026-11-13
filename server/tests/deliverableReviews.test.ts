import type { Attachment, Project, Stakeholder, User } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('revisiones de entregables', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  let stakeholder: Stakeholder;
  let attachment: Attachment;
  let id: string;
  const base = () => `/api/projects/${project.id}/deliverables`;
  const detail = async () => (await ctx.as(pm).get(`${base()}/${id}`)).json();
  const review = (body: object) => ctx.as(pm).post(`${base()}/${id}/reviews`, { reviewedOn: '2026-11-11', ...body });
  const markAll = async () => {
    for (const c of (await detail()).criteria) await ctx.as(pm).patch(`${base()}/${id}/criteria/${c.id}`, { met: true });
  };
  const makeAttachment = async (projectId: string, name: string) => {
    mkdirSync(join(ctx.dataDir, 'uploads'), { recursive: true });
    const storedName = `f-${name}-${projectId}`;
    writeFileSync(join(ctx.dataDir, 'uploads', storedName), 'x');
    return ctx.prisma.attachment.create({ data: { projectId, uploadedById: pm.id, originalName: name, storedName, mimeType: 'application/pdf', size: 1, uploadedAt: new Date() } });
  };

  beforeEach(async () => {
    ctx = await createTestApp();
    ctx.clock.set('2026-11-11T10:00:00');
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
    stakeholder = await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Cliente SA' } });
    attachment = await makeAttachment(project.id, 'acta.pdf');
    id = (await ctx.as(pm).post(base(), { name: 'Portal', criteria: ['Funciona en móvil', 'Manual'] })).json().id;
    await ctx.as(pm).patch(`${base()}/${id}`, { status: 'IN_REVIEW' });
  });
  afterEach(() => ctx.close());

  it('solo en revisión', async () => {
    await ctx.as(pm).patch(`${base()}/${id}`, { status: 'PENDING' });
    expect((await review({ outcome: 'REJECTED', note: 'X' })).statusCode).toBe(409);
  });

  it('aceptar exige todos los criterios', async () => {
    const [first] = (await detail()).criteria;
    await ctx.as(pm).patch(`${base()}/${id}/criteria/${first.id}`, { met: true });
    const partial = await review({ outcome: 'ACCEPTED' });
    expect(partial.statusCode).toBe(400);
    expect(partial.json().error.fields.criteria).toBe('Marca todos los criterios para poder aceptar');
    await markAll();
    const ok = await review({ outcome: 'ACCEPTED', stakeholderId: stakeholder.id, attachmentId: attachment.id });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('ACCEPTED');
    expect(ok.json().reviews[0]).toMatchObject({
      outcome: 'ACCEPTED',
      stakeholderName: 'Cliente SA',
      stakeholder: { id: stakeholder.id, name: 'Cliente SA' },
      attachmentName: 'acta.pdf',
      attachment: { id: attachment.id, originalName: 'acta.pdf' },
      reviewedOn: '2026-11-11',
      criteria: [
        { text: 'Funciona en móvil', met: true },
        { text: 'Manual', met: true },
      ],
    });
    expect(ok.json().lastReview).toEqual({ outcome: 'ACCEPTED', reviewedOn: '2026-11-11', stakeholderName: 'Cliente SA' });
  });

  it('sin criterios no se acepta', async () => {
    for (const c of (await detail()).criteria) await ctx.as(pm).delete(`${base()}/${id}/criteria/${c.id}`);
    expect((await review({ outcome: 'ACCEPTED' })).json().error.fields.criteria).toBeTruthy();
  });

  it('criterio nuevo tras marcar todos', async () => {
    await markAll();
    await ctx.as(pm).post(`${base()}/${id}/criteria`, { text: 'Tercero' });
    expect((await review({ outcome: 'ACCEPTED' })).statusCode).toBe(400);
  });

  it('rechazar exige nota', async () => {
    const blank = await review({ outcome: 'REJECTED', note: '  ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().error.fields.note).toBe('Escribe el motivo del rechazo');
    const ok = await review({ outcome: 'REJECTED', note: 'Faltan pruebas' });
    expect(ok.json()).toMatchObject({ status: 'REJECTED', reviews: [{ outcome: 'REJECTED', note: 'Faltan pruebas', criteria: [{ met: false }, { met: false }] }] });
  });

  it('interesado o anexo de otro proyecto', async () => {
    await markAll();
    const other = await ctx.makeProject();
    const foreignStakeholder = await ctx.prisma.stakeholder.create({ data: { projectId: other.id, name: 'Ajeno' } });
    const foreignAttachment = await makeAttachment(other.id, 'ajeno.pdf');
    expect((await review({ outcome: 'ACCEPTED', stakeholderId: foreignStakeholder.id })).json().error.fields.stakeholderId).toBeTruthy();
    expect((await review({ outcome: 'ACCEPTED', attachmentId: foreignAttachment.id })).json().error.fields.attachmentId).toBeTruthy();
    expect(await ctx.prisma.deliverableReview.count()).toBe(0);
  });

  it('el historial sobrevive a los borrados', async () => {
    await markAll();
    await review({ outcome: 'ACCEPTED', stakeholderId: stakeholder.id, attachmentId: attachment.id });
    expect((await ctx.as(pm).delete(`/api/projects/${project.id}/stakeholders/${stakeholder.id}`)).statusCode).toBe(200);
    expect((await ctx.as(pm).delete(`/api/attachments/${attachment.id}`)).statusCode).toBe(200);
    const [r] = (await detail()).reviews;
    expect(r).toMatchObject({ stakeholder: null, stakeholderName: 'Cliente SA', attachment: null, attachmentName: 'acta.pdf' });
  });

  it('reabrir conserva el historial', async () => {
    await markAll();
    await review({ outcome: 'ACCEPTED' });
    expect((await ctx.as(pm).patch(`${base()}/${id}`, { status: 'PENDING' })).statusCode).toBe(200);
    expect((await detail()).reviews).toHaveLength(1);
    expect((await ctx.as(pm).post(`${base()}/${id}/criteria`, { text: 'Nuevo' })).statusCode).toBe(200);
  });

  it('orden del historial', async () => {
    await review({ outcome: 'REJECTED', note: 'Falta' });
    ctx.clock.set('2026-11-11T11:00:00');
    await ctx.as(pm).patch(`${base()}/${id}`, { status: 'IN_REVIEW' });
    await markAll();
    await review({ outcome: 'ACCEPTED' });
    expect((await detail()).reviews.map((r: { outcome: string }) => r.outcome)).toEqual(['ACCEPTED', 'REJECTED']);
  });

  it('solo el PM', async () => {
    expect((await ctx.as(ana).post(`${base()}/${id}/reviews`, { outcome: 'REJECTED', note: 'X', reviewedOn: '2026-11-11' })).statusCode).toBe(403);
  });
});
