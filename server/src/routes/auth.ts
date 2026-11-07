import { changePasswordSchema, loginSchema, setupSchema } from '@pm/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireUser } from '../auth/guards';
import { LoginLimiter } from '../auth/loginLimiter';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, deleteSession, deleteUserSessions, SESSION_COOKIE, SESSION_HOURS } from '../auth/sessions';
import { toUserDto } from '../auth/userDto';
import { AppError, fieldError } from '../errors';

export async function authRoutes(app: FastifyInstance) {
  const limiter = new LoginLimiter();
  const { prisma } = app;

  const startSession = async (reply: FastifyReply, userId: string) => {
    const token = await createSession(prisma, userId, app.now());
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_HOURS * 3600,
    });
  };

  app.get('/api/setup/status', async () => ({ needsSetup: (await prisma.user.count()) === 0 }));

  app.post('/api/setup', async (req, reply) => {
    const input = setupSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) {
        throw new AppError(409, 'setup_complete', 'La configuración inicial ya se realizó');
      }
      return tx.user.create({ data: { name: input.name, email: input.email, passwordHash, role: 'PM' } });
    });
    await startSession(reply, user.id);
    return reply.status(201).send(toUserDto(user));
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const key = `${email}|${req.ip}`;
    const now = app.now();

    const retryAfterSeconds = limiter.retryAfterSeconds(key, now);
    if (retryAfterSeconds > 0) {
      throw new AppError(429, 'too_many_attempts', 'Demasiados intentos. Inténtalo de nuevo más tarde.', {
        details: { retryAfterSeconds },
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user?.active && (await verifyPassword(user.passwordHash, password));
    if (!user || !valid) {
      limiter.recordFailure(key, now);
      throw new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    }

    limiter.reset(key);
    await startSession(reply, user.id);
    return toUserDto(user);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionToken) await deleteSession(prisma, req.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => toUserDto(requireUser(req)));

  app.post('/api/auth/change-password', async (req) => {
    const user = requireUser(req);
    const input = changePasswordSchema.parse(req.body);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw fieldError('currentPassword', 'La contraseña actual no es correcta', 'invalid_current_password');
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    });
    await deleteUserSessions(prisma, user.id, req.sessionToken ?? undefined);
    return toUserDto(updated);
  });
}
