import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('contadores del proyecto', () => {
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

  it('los contadores no se envían', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    const list = (await ctx.as(pm).get('/api/projects')).json();
    for (const body of [detail, list[0]]) {
      expect(body).not.toHaveProperty('lastIncidentNumber');
      expect(body).not.toHaveProperty('lastDecisionNumber');
    }
    expect(await ctx.prisma.incident.count()).toBe(0);
    expect(await ctx.prisma.decision.count()).toBe(0);
  });
});
