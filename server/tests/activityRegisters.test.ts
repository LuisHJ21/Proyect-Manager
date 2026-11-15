import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('bitácora: registros, incidentes, decisiones, cambios y lecciones', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let luis: User;
  let project: Project;
  const p = () => `/api/projects/${project.id}`;
  const last = async () => (await ctx.prisma.activityLog.findMany({ orderBy: { createdAt: 'asc' } })).at(-1)!;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    luis = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Luis' });
    project = await ctx.makeProject({ members: [ana, luis] });
  });
  afterEach(() => ctx.close());

  const cases = [
    { entity: 'objective', path: 'objectives', create: { description: '<p>Vender más</p>' }, update: { status: 'MET' }, label: 'Vender más', change: { field: 'status', from: 'PENDING', to: 'MET' } },
    { entity: 'milestone', path: 'milestones', create: { name: 'Lanzamiento', dueDate: '2026-12-01' }, update: { dueDate: '2026-12-15' }, label: 'Lanzamiento', change: { field: 'dueDate', from: '2026-12-01', to: '2026-12-15' } },
    { entity: 'stakeholder', path: 'stakeholders', create: { name: 'María' }, update: { organization: 'ACME' }, label: 'María', change: { field: 'organization' } },
    { entity: 'expense', path: 'expenses', create: { description: 'Licencias', amountCents: 1000, date: '2026-11-10', category: 'SERVICES' }, update: { amountCents: 2500 }, label: 'Licencias', change: { field: 'amountCents', from: 1000, to: 2500 } },
    { entity: 'change', path: 'change-requests', create: { title: 'Más pantallas' }, update: { scheduleImpactDays: 5 }, label: 'CR-1 Más pantallas', change: { field: 'scheduleImpactDays', from: null, to: 5 } },
    { entity: 'incident', path: 'incidents', create: { title: 'Caída' }, update: { priority: 'HIGH' }, label: 'INC-1 Caída', change: { field: 'priority', from: 'MEDIUM', to: 'HIGH' } },
    { entity: 'decision', path: 'decisions', create: { title: 'Usar nube', decidedOn: '2026-11-10' }, update: { decidedOn: '2026-11-11' }, label: 'DEC-1 Usar nube', change: { field: 'decidedOn', from: '2026-11-10', to: '2026-11-11' } },
    { entity: 'lesson', path: 'lessons', create: { type: 'WORKED_WELL', category: 'TEAM', situation: 'Reuniones cortas' }, update: { category: 'COMMUNICATION' }, label: 'Reuniones cortas', change: { field: 'category', from: 'TEAM', to: 'COMMUNICATION' } },
  ] as const;

  for (const item of cases) {
    it(`${item.entity}: crear, editar y borrar`, async () => {
      const created = await ctx.as(pm).post(`${p()}/${item.path}`, item.create);
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      expect(await last()).toMatchObject({ entity: item.entity, action: 'created', entityId: id, entityLabel: item.label });
      expect((await ctx.as(pm).patch(`${p()}/${item.path}/${id}`, item.update)).statusCode).toBe(200);
      const updated = await last();
      expect(updated).toMatchObject({ entity: item.entity, action: 'updated' });
      expect(updated.changes).toContainEqual(item.change);
      expect((await ctx.as(pm).delete(`${p()}/${item.path}/${id}`)).statusCode).toBe(200);
      expect(await last()).toMatchObject({ entity: item.entity, action: 'deleted', entityLabel: item.label });
    });
  }

  it('el responsable de un riesgo se guarda por nombre y no cambia si después se renombra', async () => {
    const body = { description: 'Proveedor tarde', type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE', ownerId: ana.id };
    const risk = (await ctx.as(pm).post(`${p()}/risks`, body)).json();
    expect(await last()).toMatchObject({ entity: 'risk', action: 'created', entityLabel: 'Proveedor tarde' });
    await ctx.as(pm).patch(`${p()}/risks/${risk.id}`, { ownerId: luis.id, version: 1 });
    expect((await last()).changes).toContainEqual({ field: 'ownerId', from: 'Ana', to: 'Luis' });
    expect((await ctx.as(pm).patch(`/api/users/${ana.id}`, { name: 'Ana María' })).statusCode).toBe(200);
    expect((await last()).changes).toContainEqual({ field: 'ownerId', from: 'Ana', to: 'Luis' });
  });

  it('la etiqueta de un texto con formato decodifica las entidades', async () => {
    const body = { description: '<p>Retraso en I&amp;D &lt;crítico&gt;</p>', type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE' };
    expect((await ctx.as(pm).post(`${p()}/risks`, body)).statusCode).toBe(201);
    expect((await last()).entityLabel).toBe('Retraso en I&D <crítico>');
  });

  it('decidir un cambio registra la decisión', async () => {
    const cr = (await ctx.as(pm).post(`${p()}/change-requests`, { title: 'Más pantallas' })).json();
    const res = await ctx.as(pm).post(`${p()}/change-requests/${cr.id}/decision`, { status: 'APPROVED', note: 'Vale' });
    expect(res.statusCode).toBe(200);
    const log = await last();
    expect(log).toMatchObject({ entity: 'change', action: 'decided', entityLabel: 'CR-1 Más pantallas' });
    expect(log.changes).toContainEqual({ field: 'status', from: 'PENDING', to: 'APPROVED' });
  });

  it('el incidente creado desde un riesgo se registra como incidente', async () => {
    const body = { description: '<p>Servidor caído</p>', type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE' };
    const risk = (await ctx.as(pm).post(`${p()}/risks`, body)).json();
    const res = await ctx.as(pm).post(`${p()}/risks/${risk.id}/incident`, {});
    expect(res.statusCode).toBe(201);
    expect(await last()).toMatchObject({
      entity: 'incident',
      action: 'created',
      entityId: res.json().id,
      entityLabel: `INC-1 ${res.json().title} (desde el riesgo «Servidor caído»)`,
    });
  });

  it('una lección en un proyecto cerrado también se registra', async () => {
    await ctx.prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const res = await ctx.as(ana).post(`${p()}/lessons`, { type: 'TO_IMPROVE', category: 'SCOPE', situation: 'Alcance difuso' });
    expect(res.statusCode).toBe(201);
    expect(await last()).toMatchObject({ entity: 'lesson', action: 'created', userId: ana.id });
  });
});
