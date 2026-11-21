import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, uploadFile, type TestCtx } from './helpers/testApp';

const deliverableVersion = async (ctx: TestCtx, id: string) => (await ctx.prisma.deliverable.findUniqueOrThrow({ where: { id } })).version;

describe('bitácora: entregables, RACI, miembros, dependencias, anexos y acta', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const p = () => `/api/projects/${project.id}`;
  const all = () => ctx.prisma.activityLog.findMany({ orderBy: { createdAt: 'asc' } });
  const last = async () => (await all()).at(-1)!;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('entregable, criterios, orden y revisión', async () => {
    const created = (await ctx.as(pm).post(`${p()}/deliverables`, { name: 'Portal', criteria: ['Funciona en móvil'] })).json();
    expect(await last()).toMatchObject({ entity: 'deliverable', action: 'created', entityLabel: 'Portal' });
    const criterion = (await ctx.as(pm).get(`${p()}/deliverables/${created.id}`)).json().criteria[0];
    await ctx.as(pm).patch(`${p()}/deliverables/${created.id}/criteria/${criterion.id}`, { met: true });
    expect(await last()).toMatchObject({ entity: 'deliverable', action: 'updated', entityLabel: 'Portal · Funciona en móvil' });
    expect((await last()).changes).toContainEqual({ field: 'met', from: false, to: true });
    const added = (await ctx.as(pm).post(`${p()}/deliverables/${created.id}/criteria`, { text: 'Es rápido' })).json();
    expect(await last()).toMatchObject({ action: 'created', entityLabel: 'Portal · Es rápido' });
    const ids = added.criteria.map((c: { id: string }) => c.id).reverse();
    expect((await ctx.as(pm).put(`${p()}/deliverables/${created.id}/criteria/order`, { ids })).statusCode).toBe(200);
    expect(await last()).toMatchObject({ action: 'updated', entityLabel: 'Portal', changes: [{ field: 'criteriaOrder' }] });
    // Aceptar exige todos los criterios cumplidos.
    await ctx.as(pm).patch(`${p()}/deliverables/${created.id}/criteria/${ids[0]}`, { met: true });
    await ctx.as(pm).patch(`${p()}/deliverables/${created.id}`, { status: 'IN_REVIEW', version: await deliverableVersion(ctx, created.id) });
    expect((await last()).changes).toContainEqual({ field: 'status', from: 'PENDING', to: 'IN_REVIEW' });
    const review = await ctx.as(pm).post(`${p()}/deliverables/${created.id}/reviews`, { outcome: 'ACCEPTED', reviewedOn: '2026-11-10' });
    expect(review.statusCode).toBe(200);
    expect(await last()).toMatchObject({ entity: 'deliverable', action: 'reviewed', entityLabel: 'Portal' });
    expect((await last()).changes).toContainEqual({ field: 'status', from: 'IN_REVIEW', to: 'ACCEPTED' });
  });

  it('miembros: alta, rol y baja', async () => {
    await ctx.as(pm).post(`${p()}/roles`, { name: 'Diseño' });
    await ctx.as(pm).post(`${p()}/roles`, { name: 'Arquitectura' });
    await ctx.as(pm).post(`${p()}/members`, { userId: luis.id, projectRole: 'Diseño' });
    expect(await last()).toMatchObject({ entity: 'member', action: 'created', entityLabel: 'Luis' });
    await ctx.as(pm).patch(`${p()}/members/${luis.id}`, { projectRole: 'Arquitectura' });
    expect((await last()).changes).toContainEqual({ field: 'projectRole', from: 'Diseño', to: 'Arquitectura' });
    await ctx.as(pm).delete(`${p()}/members/${luis.id}`);
    expect(await last()).toMatchObject({ entity: 'member', action: 'deleted', entityLabel: 'Luis' });
  });

  it('RACI: asignar, cambiar y quitar un rol', async () => {
    const activity = (await ctx.as(pm).post(`${p()}/raci/activities`, { title: 'Diseño' })).json();
    expect(await last()).toMatchObject({ entity: 'raci', action: 'created', entityLabel: 'Diseño' });
    const cell = (role: string | null) => ctx.as(pm).put(`${p()}/raci/cells`, { activityId: activity.id, kind: 'member', partyId: ana.id, role });
    await cell('R');
    expect(await last()).toMatchObject({ entity: 'raci', action: 'created', entityLabel: 'Diseño · Ana', changes: [{ field: 'role', from: null, to: 'R' }] });
    await cell('A');
    expect(await last()).toMatchObject({ action: 'updated', changes: [{ field: 'role', from: 'R', to: 'A' }] });
    await cell(null);
    expect(await last()).toMatchObject({ action: 'deleted', changes: [{ field: 'role', from: 'A', to: null }] });
    const count = (await all()).length;
    await cell(null);
    expect(await all()).toHaveLength(count);
  });

  it('dependencias', async () => {
    const diseno = await ctx.makeTask(project.id, { title: 'Diseño' });
    const obra = await ctx.makeTask(project.id, { title: 'Construcción' });
    expect((await ctx.as(pm).post(`/api/tasks/${obra.id}/dependencies`, { predecessorId: diseno.id })).statusCode).toBe(201);
    expect(await last()).toMatchObject({ entity: 'task', action: 'created', entityLabel: 'Construcción ← Diseño' });
    await ctx.as(pm).delete(`/api/tasks/${obra.id}/dependencies/${diseno.id}`);
    expect(await last()).toMatchObject({ entity: 'task', action: 'deleted', entityLabel: 'Construcción ← Diseño' });
  });

  it('anexos: completar dos veces deja un solo registro', async () => {
    const file = { name: 'plano.pdf', type: 'application/pdf', content: Buffer.from('%PDF-prueba') };
    const attachment = await uploadFile(ctx.as(pm), `${p()}/attachments`, file);
    expect((await ctx.as(pm).post(`/api/attachments/${attachment.id}/complete`)).statusCode).toBe(200);
    const uploads = (await all()).filter((log) => log.entity === 'attachment');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ action: 'uploaded', entityLabel: 'plano.pdf', userId: pm.id });
    await ctx.as(pm).delete(`/api/attachments/${attachment.id}`);
    expect(await last()).toMatchObject({ entity: 'attachment', action: 'deleted', entityLabel: 'plano.pdf' });
  });

  it('acta, aprobación, línea base, cierre y reapertura', async () => {
    const charter = { justification: '<p>Ventas</p>', scopeIncluded: '<p>Portal</p>', successCriteria: '<p>Lanzado</p>' };
    await ctx.as(pm).put(`${p()}/charter`, { ...charter, version: 1 });
    expect(await last()).toMatchObject({ entity: 'project', action: 'updated' });
    expect((await last()).changes).toContainEqual({ field: 'charter.scopeIncluded' });
    expect((await ctx.as(pm).post(`${p()}/charter/approve`, { version: 2 })).statusCode).toBe(200);
    expect(await last()).toMatchObject({ entity: 'project', action: 'approved' });
    await ctx.prisma.task.create({ data: { projectId: project.id, title: 'Obra', plannedCostCents: 1000, startDate: '2026-11-10', dueDate: '2026-11-20' } });
    expect((await ctx.as(pm).post(`${p()}/baselines`, {})).statusCode).toBe(201);
    expect(await last()).toMatchObject({ entity: 'project', action: 'baselined' });
    const closed = await ctx.as(pm).post(`${p()}/closure`, { finalStatus: 'CLOSED', pendingReason: 'Sin pendientes' });
    expect(closed.statusCode).toBe(200);
    expect(await last()).toMatchObject({ entity: 'project', action: 'closed' });
    expect((await last()).changes).toContainEqual({ field: 'status', from: 'PLANNING', to: 'CLOSED' });
    expect((await ctx.as(pm).post(`${p()}/reopen`, { reason: 'Revisar' })).statusCode).toBe(200);
    expect(await last()).toMatchObject({ entity: 'project', action: 'reopened' });
  });
});
