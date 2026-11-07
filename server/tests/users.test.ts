import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';

const newUser = { name: 'Beatriz', email: 'Bea@x.com', role: 'COLLABORATOR', temporaryPassword: 'temporal-12345' };

describe('usuarios', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('colaborador recibe 403 y anónimo 401 en /api/users', async () => {
    const c = await ctx.makeUser({ role: 'COLLABORATOR' });
    expect((await ctx.as(c).get('/api/users')).statusCode).toBe(403);
    expect((await ctx.anon.get('/api/users')).statusCode).toBe(401);
  });

  it('crear usuario deja mustChangePassword=true y no devuelve passwordHash', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const res = await ctx.as(pm).post('/api/users', newUser);
    expect(res.statusCode).toBe(201);
    expect(res.json().mustChangePassword).toBe(true);
    expect(res.json().email).toBe('bea@x.com');
    expect(res.body).not.toContain('passwordHash');
    const login = await ctx.anon.post('/api/auth/login', { email: 'bea@x.com', password: 'temporal-12345' });
    expect(login.statusCode).toBe(200);
  });

  it('la lista no incluye passwordHash', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const res = await ctx.as(pm).get('/api/users');
    expect(res.json()).toHaveLength(1);
    expect(res.body).not.toContain('passwordHash');
  });

  it('correo duplicado responde 409 email_taken con fields.email', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    await ctx.as(pm).post('/api/users', newUser);
    const res = await ctx.as(pm).post('/api/users', { ...newUser, email: ' BEA@X.COM' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
    expect(res.json().error.fields.email).toBeTruthy();
  });

  it('desactivar invalida sus sesiones', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const c = await ctx.makeUser({ role: 'COLLABORATOR' });
    const client = ctx.as(c);
    expect((await client.get('/api/auth/me')).statusCode).toBe(200);
    const res = await ctx.as(pm).patch(`/api/users/${c.id}`, { active: false });
    expect(res.json().active).toBe(false);
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
    expect(await ctx.prisma.session.count({ where: { userId: c.id } })).toBe(0);
  });

  it('no se puede desactivar ni degradar al último PM activo', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    for (const body of [{ active: false }, { role: 'COLLABORATOR' }]) {
      const res = await ctx.as(pm).patch(`/api/users/${pm.id}`, body);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('last_pm');
    }
  });

  it('un PM inactivo no cuenta como último PM activo', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    await ctx.makeUser({ role: 'PM', active: false });
    expect((await ctx.as(pm).patch(`/api/users/${pm.id}`, { active: false })).statusCode).toBe(409);
  });

  it('con otro PM activo sí se puede desactivar', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const other = await ctx.makeUser({ role: 'PM' });
    expect((await ctx.as(pm).patch(`/api/users/${other.id}`, { active: false })).statusCode).toBe(200);
  });

  it('reset-password exige cambiarla al entrar e invalida sesiones', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    const c = await ctx.makeUser({ role: 'COLLABORATOR', password: 'contraseña-vieja' });
    const client = ctx.as(c);
    await client.get('/api/auth/me');
    const res = await ctx.as(pm).post(`/api/users/${c.id}/reset-password`, { temporaryPassword: 'temporal-nueva-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().mustChangePassword).toBe(true);
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
    expect((await ctx.anon.post('/api/auth/login', { email: c.email, password: 'temporal-nueva-1' })).statusCode).toBe(200);
  });

  it('usuario inexistente responde 404', async () => {
    const pm = await ctx.makeUser({ role: 'PM' });
    expect((await ctx.as(pm).patch('/api/users/nope', { name: 'X' })).statusCode).toBe(404);
  });
});
