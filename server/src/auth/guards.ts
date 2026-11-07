import type { User } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, forbidden } from '../errors';
import { findSessionUser, SESSION_COOKIE } from './sessions';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionToken: string | null;
  }
}

const ALLOWED_DURING_PASSWORD_CHANGE = new Set(['/api/setup/status', '/api/auth/me', '/api/auth/logout', '/api/auth/change-password']);

export function registerAuthHook(app: FastifyInstance) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('preHandler', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const user = await findSessionUser(app.prisma, token, app.now());
    if (!user) return;
    req.user = user;
    req.sessionToken = token;

    const path = req.url.split('?')[0]!;
    if (user.mustChangePassword && path.startsWith('/api/') && !ALLOWED_DURING_PASSWORD_CHANGE.has(path)) {
      throw new AppError(403, 'password_change_required', 'Debes cambiar tu contraseña para continuar');
    }
  });
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw new AppError(401, 'unauthenticated', 'Tu sesión ha terminado. Inicia sesión de nuevo.');
  return req.user;
}

export function requirePm(req: FastifyRequest): User {
  const user = requireUser(req);
  if (user.role !== 'PM') throw forbidden();
  return user;
}
