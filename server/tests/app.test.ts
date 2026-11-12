import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app';
import { AppError } from '../src/errors';
import { readBody } from '../src/http';
import { withStatic } from '../src/static';
import { createTestApp, type TestCtx } from './helpers/testApp';

const fixtureDist = resolve(__dirname, 'fixtures/client-dist');

describe('aplicación', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp({ build: (opts) => withStatic(buildApp(opts), fixtureDist) });
  });
  afterEach(() => ctx.close());

  it('devuelve JSON en rutas API desconocidas', async () => {
    const res = await ctx.anon.get('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('devuelve index.html en rutas de la web', async () => {
    const res = await ctx.anon.get('/proyectos/abc');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('convierte ZodError en 400 con errores por campo', async () => {
    ctx.app.post('/api/__zod', async (c) => c.json(z.object({ name: z.string().min(1, 'Requerido') }).parse(await readBody(c))));
    const res = await ctx.anon.post('/api/__zod', { name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    expect(res.json().error.fields.name).toBe('Requerido');
  });

  it('convierte AppError a su estado, código y detalles', async () => {
    ctx.app.get('/api/__app', async () => {
      throw new AppError(409, 'conflict_x', 'Conflicto', { details: { a: 1 } });
    });
    const res = await ctx.anon.get('/api/__app');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({ code: 'conflict_x', message: 'Conflicto', details: { a: 1 } });
  });

  it('un error inesperado responde 500 sin filtrar el mensaje interno', async () => {
    ctx.app.get('/api/__boom', async () => {
      throw new Error('secreto interno');
    });
    const res = await ctx.anon.get('/api/__boom');
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    expect(res.body).not.toContain('secreto');
  });

  it('usa el reloj inyectado', async () => {
    ctx.app.get('/api/__now', (c) => c.json({ hours: c.var.deps.now().getHours() }));
    ctx.clock.set('2026-11-06T08:00:00');
    expect((await ctx.anon.get('/api/__now')).json().hours).toBe(8);
  });
});
