import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('modelos de cierre', () => {
  let ctx: TestCtx;
  let ana: User;
  let project: Project;
  beforeEach(async () => {
    ctx = await createTestApp();
    await ctx.makeUser({ role: 'PM' });
    ana = await ctx.makeUser({ role: 'COLLABORATOR', name: 'Ana' });
    project = await ctx.makeProject({ members: [ana] });
  });
  afterEach(() => ctx.close());

  it('el detalle del proyecto incluye closedAt', async () => {
    const detail = (await ctx.as(ana).get(`/api/projects/${project.id}`)).json();
    expect(detail).toHaveProperty('closedAt', null);
    expect(await ctx.prisma.lesson.count()).toBe(0);
  });
});
