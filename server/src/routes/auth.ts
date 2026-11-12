import { changePasswordSchema, loginSchema, setupSchema } from '@pm/shared';
import { deleteCookie, setCookie } from 'hono/cookie';
import { requireUser } from '../auth/guards';
import { LoginLimiter } from '../auth/loginLimiter';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, deleteSession, deleteUserSessions, SESSION_COOKIE, SESSION_HOURS } from '../auth/sessions';
import { toUserDto } from '../auth/userDto';
import { AppError, fieldError } from '../errors';
import { readBody, type App, type Ctx } from '../http';

export function authRoutes(app: App) {
  const limiter = new LoginLimiter();

  const startSession = async (c: Ctx, userId: string) => {
    const token = await createSession(c.var.deps.prisma, userId, c.var.deps.now());
    setCookie(c, SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: SESSION_HOURS * 3600,
    });
  };

  app.get('/api/setup/status', async (c) => c.json({ needsSetup: (await c.var.deps.prisma.user.count()) === 0 }));

  app.post('/api/setup', async (c) => {
    const { prisma } = c.var.deps;
    const input = setupSchema.parse(await readBody(c));
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) {
        throw new AppError(409, 'setup_complete', 'La configuración inicial ya se realizó');
      }
      return tx.user.create({ data: { name: input.name, email: input.email, passwordHash, role: 'PM' } });
    });
    await startSession(c, user.id);
    return c.json(toUserDto(user), 201);
  });

  app.post('/api/auth/login', async (c) => {
    const { prisma } = c.var.deps;
    const { email, password } = loginSchema.parse(await readBody(c));
    const key = `${email}|${c.var.deps.clientIp(c)}`;
    const now = c.var.deps.now();

    const retryAfterSeconds = limiter.retryAfterSeconds(key, now);
    if (retryAfterSeconds > 0) {
      const minutes = Math.ceil(retryAfterSeconds / 60);
      const wait = minutes === 1 ? '1 minuto' : `${minutes} minutos`;
      throw new AppError(429, 'too_many_attempts', `Demasiados intentos. Inténtalo de nuevo en ${wait}.`, {
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
    await startSession(c, user.id);
    return c.json(toUserDto(user));
  });

  app.post('/api/auth/logout', async (c) => {
    const token = c.var.sessionToken;
    if (token) await deleteSession(c.var.deps.prisma, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', async (c) => c.json(toUserDto(requireUser(c))));

  app.post('/api/auth/change-password', async (c) => {
    const { prisma } = c.var.deps;
    const user = requireUser(c);
    const input = changePasswordSchema.parse(await readBody(c));
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw fieldError('currentPassword', 'La contraseña actual no es correcta', 'invalid_current_password');
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    });
    await deleteUserSessions(prisma, user.id, c.var.sessionToken ?? undefined);
    return c.json(toUserDto(updated));
  });
}
