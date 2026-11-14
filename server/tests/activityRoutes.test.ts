import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('consulta de la bitácora', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let olga: User;
  let project: Project;
  const base = () => `/api/projects/${project.id}/activity`;

  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM', name: 'Paula' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    olga = await ctx.makeUser({ role: 'OBSERVER', name: 'Olga' });
    project = await ctx.makeProject({ members: [ana, olga] });
  });
  afterEach(() => ctx.close());

  const seed = (count: number, userId = pm.id, entity = 'task') =>
    ctx.prisma.activityLog.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        projectId: project.id,
        userId,
        action: 'updated',
        entity,
        entityLabel: `Elemento ${i}`,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
      })),
    });

  it('pagina de 50 en 50, del más reciente al más antiguo', async () => {
    await seed(51);
    const first = (await ctx.as(pm).get(base())).json();
    expect(first.items).toHaveLength(50);
    expect(first.items[0]).toMatchObject({ entityLabel: 'Elemento 50', action: 'updated', entity: 'task', changes: [], user: { id: pm.id, name: 'Paula' } });
    expect(first.nextCursor).toBe(first.items[49].id);
    const second = (await ctx.as(pm).get(`${base()}?before=${first.nextCursor}`)).json();
    expect(second.items.map((i: { entityLabel: string }) => i.entityLabel)).toEqual(['Elemento 0']);
    expect(second.nextCursor).toBeNull();
  });

  it('filtra por persona y por tipo', async () => {
    await seed(2, pm.id, 'task');
    await seed(3, ana.id, 'risk');
    expect((await ctx.as(pm).get(`${base()}?userId=${ana.id}`)).json().items).toHaveLength(3);
    expect((await ctx.as(pm).get(`${base()}?entity=task`)).json().items).toHaveLength(2);
    const invalid = await ctx.as(pm).get(`${base()}?entity=nada`);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields.entity).toBe('Tipo de elemento no válido');
  });

  it('los filtros listan solo personas y tipos con registros', async () => {
    await seed(1, pm.id, 'task');
    await seed(1, ana.id, 'risk');
    expect((await ctx.as(pm).get(`${base()}/filters`)).json()).toEqual({
      users: [
        { id: ana.id, name: 'Ana' },
        { id: pm.id, name: 'Paula' },
      ],
      entities: ['risk', 'task'],
    });
  });

  it('colaborador y observador no consultan la bitácora', async () => {
    for (const user of [ana, olga]) {
      expect((await ctx.as(user).get(base())).statusCode).toBe(403);
      expect((await ctx.as(user).get(`${base()}/filters`)).statusCode).toBe(403);
    }
  });

  it('el colaborador queda como autor de su cambio de riesgo y aun así no ve la bitácora', async () => {
    const risk = await ctx.prisma.risk.create({
      data: { projectId: project.id, description: 'Proveedor tarde', type: 'THREAT', probability: 2, impact: 3, response: 'MITIGATE', ownerId: ana.id },
    });
    expect((await ctx.as(ana).patch(`/api/projects/${project.id}/risks/${risk.id}`, { status: 'TREATING' })).statusCode).toBe(200);
    const items = (await ctx.as(pm).get(base())).json().items;
    expect(items[0]).toMatchObject({ entity: 'risk', user: { id: ana.id, name: 'Ana' } });
    expect(items[0].changes).toContainEqual({ field: 'status', from: 'OPEN', to: 'TREATING' });
    expect((await ctx.as(ana).get(base())).statusCode).toBe(403);
  });
});
