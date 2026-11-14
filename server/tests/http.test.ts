import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('núcleo HTTP', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('responde 400 con el formato común si el JSON no es válido', async () => {
    const res = await ctx.app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{mal' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('bad_request');
  });

  it('responde 400 de validación si falta el cuerpo', async () => {
    const res = await ctx.anon.post('/api/auth/login');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('responde 404 con el formato común en una ruta de API inexistente', async () => {
    const res = await ctx.anon.get('/api/no-existe');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});
