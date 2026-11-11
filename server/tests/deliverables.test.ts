import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('contador de entregables', () => {
  let ctx: TestCtx;
  let pm: User;
  let ana: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('el contador no se envía', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const list = (await ctx.as(pm).get('/api/projects')).json();
    for (const body of [detail, list[0]]) expect(body).not.toHaveProperty('lastDeliverableNumber');
    expect(await ctx.prisma.deliverable.count()).toBe(0);
  });
});
