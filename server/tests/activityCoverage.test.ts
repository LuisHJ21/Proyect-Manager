import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_TABLE, NOT_LOGGED } from '../src/activity/table';
import { listRoutes } from '../src/http';
import { createTestApp, type TestCtx } from './helpers/testApp';

const WRITES = ['POST', 'PATCH', 'PUT', 'DELETE'];

describe('cobertura de la bitácora', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('toda ruta de escritura está en la tabla o en NOT_LOGGED, y en una sola', () => {
    const keys = listRoutes(ctx.app)
      .filter((r) => WRITES.includes(r.method))
      .map((r) => `${r.method} ${r.url}`);
    expect(keys.filter((key) => !(key in ACTIVITY_TABLE) && !(key in NOT_LOGGED))).toEqual([]);
    expect(keys.filter((key) => key in ACTIVITY_TABLE && key in NOT_LOGGED)).toEqual([]);
    expect(Object.keys(ACTIVITY_TABLE).filter((key) => !keys.includes(key))).toEqual([]);
  });

  it('NOT_LOGGED es la lista de la especificación', () => {
    expect(Object.keys(NOT_LOGGED).sort()).toEqual(
      [
        'POST /api/setup',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/change-password',
        'POST /api/users',
        'PATCH /api/users/:id',
        'POST /api/users/:id/reset-password',
        'POST /api/projects/:id/attachments',
        'POST /api/tasks/:id/attachments',
        'PUT /api/local-uploads/:storedName',
        'DELETE /api/projects/:id',
      ].sort(),
    );
  });
});
