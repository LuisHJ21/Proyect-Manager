import type { User } from '@prisma/client';
import { getCookie } from 'hono/cookie';
import { AppError, forbidden } from '../errors';
import type { App, Ctx } from '../http';
import { findSessionUser, SESSION_COOKIE } from './sessions';

const ALLOWED_DURING_PASSWORD_CHANGE = new Set(['/api/setup/status', '/api/auth/me', '/api/auth/logout', '/api/auth/change-password']);

export function registerAuthHook(app: App) {
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const { prisma, now } = c.var.deps;
      const user = await findSessionUser(prisma, token, now());
      if (user) {
        c.set('user', user);
        c.set('sessionToken', token);
        if (user.mustChangePassword && c.req.path.startsWith('/api/') && !ALLOWED_DURING_PASSWORD_CHANGE.has(c.req.path)) {
          throw new AppError(403, 'password_change_required', 'Debes cambiar tu contraseña para continuar');
        }
      }
    }
    await next();
  });
}

export function requireUser(c: Ctx): User {
  const user = c.var.user;
  if (!user) throw new AppError(401, 'unauthenticated', 'Tu sesión ha terminado. Inicia sesión de nuevo.');
  return user;
}

export function requirePm(c: Ctx): User {
  const user = requireUser(c);
  if (user.role !== 'PM') throw forbidden();
  return user;
}
