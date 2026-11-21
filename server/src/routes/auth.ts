import { createHash, timingSafeEqual } from 'node:crypto';
import { changePasswordSchema, loginSchema, setupSchema } from '@pm/shared';
import { deleteCookie, setCookie } from 'hono/cookie';
import { requireUser } from '../auth/guards';
import { LoginLimiter } from '../auth/loginLimiter';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, deleteSession, deleteUserSessions, SESSION_COOKIE, SESSION_HOURS } from '../auth/sessions';
import { toUserDto } from '../auth/userDto';
import { AppError, fieldError } from '../errors';
import { readBody, type App, type Ctx } from '../http';

/** Compara el código en tiempo constante. Los resúmenes igualan el largo, así no se filtra por la duración. */
function sameToken(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function authRoutes(app: App) {
  const startSession = async (c: Ctx, userId: string) => {
    const token = await createSession(c.var.deps.prisma, userId, c.var.deps.now());
    setCookie(c, SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: c.var.deps.secureCookies,
      sameSite: 'Lax',
      maxAge: SESSION_HOURS * 3600,
    });
  };

  app.get('/api/setup/status', async (c) =>
    c.json({ needsSetup: (await c.var.deps.prisma.user.count()) === 0, requiresToken: Boolean(c.var.deps.setupToken) }),
  );

  app.post('/api/setup', async (c) => {
    const { prisma } = c.var.deps;
    const input = setupSchema.parse(await readBody(c));
    const { setupToken } = c.var.deps;
    if (setupToken && !sameToken(input.token, setupToken)) {
      throw new AppError(403, 'setup_token_invalid', 'El código de configuración no es correcto');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      // Serializa la creación del primer PM entre instancias.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(0, 1)`;
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
    const limiter = new LoginLimiter(prisma);
    const { email, password } = loginSchema.parse(await readBody(c));
    const key = `${email}|${c.var.deps.clientIp(c)}`;
    const now = c.var.deps.now();

    const retryAfterSeconds = await limiter.retryAfterSeconds(key, now);
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
      await limiter.recordFailure(key, now);
      throw new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    }

    await limiter.reset(key);
    await startSession(c, user.id);
    return c.json(toUserDto(user));
  });

  app.post('/api/auth/logout', async (c) => {
    const token = c.var.sessionToken;
    if (token) await deleteSession(c.var.deps.prisma, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: c.var.deps.secureCookies });
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
