import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('seguridad por filas', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('todas las tablas públicas tienen RLS activado', async () => {
    const rows = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false`;
    expect(rows).toEqual([]);
  });
});
