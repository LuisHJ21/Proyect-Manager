import type { Deliverable, Project, Stakeholder, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('requisitos', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let obs: User;
  let project: Project;
  let portal: Deliverable;
  let manual: Deliverable;
  let sponsor: Stakeholder;
  const url = () => `/api/projects/${project.id}/requirements`;
  const deliverable = (number: number, name: string, status = 'PENDING') =>
    ctx.prisma.deliverable.create({ data: { projectId: project.id, number, name, status } });

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR' });
    obs = await ctx.makeUser({ role: 'OBSERVER' });
    project = await ctx.makeProject({ members: [ana, obs] });
    portal = await deliverable(1, 'Portal web');
    manual = await deliverable(2, 'Manual');
    sponsor = await ctx.prisma.stakeholder.create({ data: { projectId: project.id, name: 'Patrocinador' } });
  });
  afterEach(() => ctx.close());

  it('el PM crea REQ-1 y REQ-2 ligados a entregables', async () => {
    const first = await ctx.as(pm).post(url(), { description: '<p>Acceso con usuario</p>', deliverableIds: [manual.id, portal.id], stakeholderId: sponsor.id });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      number: 1,
      priority: 'MEDIUM',
      status: 'PROPOSED',
      version: 1,
      stakeholder: { id: sponsor.id, name: 'Patrocinador' },
      deliverables: [
        { id: portal.id, number: 1, name: 'Portal web', status: 'PENDING' },
        { id: manual.id, number: 2, name: 'Manual', status: 'PENDING' },
      ],
    });
    const second = (await ctx.as(pm).post(url(), { description: 'Reportes' })).json();
    expect(second.number).toBe(2);
    const listed = (await ctx.as(pm).get(url())).json();
    expect(listed.map((r: { number: number }) => r.number)).toEqual([1, 2]);
    const edited = await ctx.as(pm).patch(`${url()}/${second.id}`, { deliverableIds: [portal.id], version: 1 });
    expect(edited.json()).toMatchObject({ version: 2, deliverables: [{ id: portal.id }] });
  });

  it('el colaborador y el observador leen sin interesado y no escriben', async () => {
    const created = (await ctx.as(pm).post(url(), { description: 'Acceso', stakeholderId: sponsor.id })).json();
    for (const user of [ana, obs]) {
      const list = await ctx.as(user).get(url());
      expect(list.statusCode).toBe(200);
      expect(list.json()[0]).not.toHaveProperty('stakeholder');
      expect(JSON.stringify(list.json())).not.toContain('Patrocinador');
      expect((await ctx.as(user).post(url(), { description: 'X' })).statusCode).toBe(403);
      expect((await ctx.as(user).patch(`${url()}/${created.id}`, { status: 'MET', version: 1 })).statusCode).toBe(403);
      expect((await ctx.as(user).delete(`${url()}/${created.id}`)).statusCode).toBe(403);
    }
  });

  it('entregable o interesado de otro proyecto dan 400', async () => {
    const other = await ctx.makeProject();
    const foreignDeliverable = await ctx.prisma.deliverable.create({ data: { projectId: other.id, number: 1, name: 'Ajeno' } });
    const foreignStakeholder = await ctx.prisma.stakeholder.create({ data: { projectId: other.id, name: 'Ajeno' } });
    const badDeliverable = await ctx.as(pm).post(url(), { description: 'A', deliverableIds: [foreignDeliverable.id] });
    expect(badDeliverable.statusCode).toBe(400);
    expect(JSON.stringify(badDeliverable.json())).toContain('El entregable no pertenece a este proyecto');
    const badStakeholder = await ctx.as(pm).post(url(), { description: 'A', stakeholderId: foreignStakeholder.id });
    expect(JSON.stringify(badStakeholder.json())).toContain('El interesado no pertenece a este proyecto');
    expect(await ctx.prisma.requirement.count()).toBe(0);
  });

  it('sugiere cumplido cuando todos sus entregables están aceptados', async () => {
    await ctx.prisma.deliverable.update({ where: { id: portal.id }, data: { status: 'ACCEPTED' } });
    const approved = (await ctx.as(pm).post(url(), { description: 'A', status: 'APPROVED', deliverableIds: [portal.id] })).json();
    expect(approved.suggestMet).toBe(true);
    const proposed = (await ctx.as(pm).post(url(), { description: 'B', deliverableIds: [portal.id] })).json();
    expect(proposed.suggestMet).toBe(false);
    const alone = (await ctx.as(pm).post(url(), { description: 'C', status: 'APPROVED' })).json();
    expect(alone.suggestMet).toBe(false);
    const mixed = (await ctx.as(pm).post(url(), { description: 'D', status: 'APPROVED', deliverableIds: [portal.id, manual.id] })).json();
    expect(mixed.suggestMet).toBe(false);
  });

  it('una edición con versión vieja da 409', async () => {
    const created = (await ctx.as(pm).post(url(), { description: 'A' })).json();
    expect((await ctx.as(pm).patch(`${url()}/${created.id}`, { status: 'APPROVED', version: 1 })).statusCode).toBe(200);
    expect((await ctx.as(pm).patch(`${url()}/${created.id}`, { priority: 'HIGH', version: 1 })).statusCode).toBe(409);
  });

  it('la descripción se sanea y borrar quita el requisito', async () => {
    const created = (await ctx.as(pm).post(url(), { description: '<p>Hola</p><script>x</script>' })).json();
    expect(created.description).not.toContain('<script>');
    expect((await ctx.as(pm).delete(`${url()}/${created.id}`)).statusCode).toBe(200);
    expect(await ctx.prisma.requirement.count()).toBe(0);
  });
});
