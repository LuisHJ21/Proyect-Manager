import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/auth/passwords';
import { listProjectManagers, resetPassword } from '../src/auth/resetPassword';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('restablecer contraseña desde la terminal', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  it('pone una contraseña temporal, pide cambiarla y cierra las sesiones abiertas', async () => {
    const pm = await ctx.makeUser({ role: 'PM', email: 'paula@x.com', password: 'olvidada-123456' });
    await ctx.as(pm).get('/api/auth/me');
    expect(await ctx.prisma.session.count({ where: { userId: pm.id } })).toBe(1);

    const { temporaryPassword, user } = await resetPassword(ctx.prisma, '  Paula@X.com ');
    expect(user).toEqual({ name: pm.name, email: 'paula@x.com' });
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(10);

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: pm.id } });
    expect(await verifyPassword(stored.passwordHash, temporaryPassword)).toBe(true);
    expect(await verifyPassword(stored.passwordHash, 'olvidada-123456')).toBe(false);
    expect(stored.mustChangePassword).toBe(true);
    expect(await ctx.prisma.session.count({ where: { userId: pm.id } })).toBe(0);
  });

  it('reactiva una cuenta desactivada', async () => {
    await ctx.makeUser({ role: 'PM', email: 'paula@x.com', active: false });
    await resetPassword(ctx.prisma, 'paula@x.com');
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'paula@x.com' } })).active).toBe(true);
  });

  it('cada restablecimiento genera una contraseña distinta', async () => {
    await ctx.makeUser({ role: 'PM', email: 'paula@x.com' });
    const first = await resetPassword(ctx.prisma, 'paula@x.com');
    const second = await resetPassword(ctx.prisma, 'paula@x.com');
    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });

  it('un correo inexistente da un error claro', async () => {
    await expect(resetPassword(ctx.prisma, 'nadie@x.com')).rejects.toThrow('No existe un usuario con el correo nadie@x.com');
  });

  it('lista los Project Managers para recordar el correo', async () => {
    await ctx.makeUser({ role: 'PM', name: 'Paula', email: 'paula@x.com' });
    await ctx.makeUser({ role: 'COLLABORATOR', name: 'Carlos', email: 'carlos@x.com' });
    expect(await listProjectManagers(ctx.prisma)).toEqual([{ name: 'Paula', email: 'paula@x.com', active: true }]);
  });
});
