import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers/testApp';
import { LoginLimiter } from '../src/auth/loginLimiter';

const PASSWORD = 'contraseña-larga';

describe('autenticación', () => {
  let ctx: TestCtx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(() => ctx.close());

  const login = (email: string, password: string) => ctx.anon.post('/api/auth/login', { email, password });
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => {
    const c = res.cookies.find((x) => x.name === 'pm_session')!;
    return `pm_session=${c.value}`;
  };
  const setup = (email = 'ana@x.com') => ctx.anon.post('/api/setup', { name: 'Ana', email, password: PASSWORD });

  it('setup crea el primer PM una sola vez', async () => {
    expect((await ctx.anon.get('/api/setup/status')).json().needsSetup).toBe(true);
    const res = await setup();
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe('PM');
    expect(res.json()).not.toHaveProperty('passwordHash');
    expect((await ctx.anon.get('/api/setup/status')).json().needsSetup).toBe(false);
    const again = await setup('otra@x.com');
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('setup_complete');
  });

  it('dos configuraciones simultáneas solo crean un PM', async () => {
    await ctx.prisma.$executeRawUnsafe(`CREATE FUNCTION pause_first_user() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END $$ LANGUAGE plpgsql`);
    await ctx.prisma.$executeRawUnsafe(`CREATE TRIGGER pause_first_user BEFORE INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION pause_first_user()`);
    const responses = await Promise.all([setup('uno@x.com'), setup('dos@x.com')]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it('correo con mayúsculas y espacios es la misma cuenta', async () => {
    await setup(' Ana@X.com ');
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(200);
    expect((await login('  ANA@x.COM', PASSWORD)).statusCode).toBe(200);
  });

  it('la cookie es httpOnly y SameSite=Lax', async () => {
    await setup();
    const header = String((await login('ana@x.com', PASSWORD)).headers['set-cookie']);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });

  it('la sesión vence a las 12 horas', async () => {
    await setup();
    ctx.clock.set('2026-11-06T08:00:00');
    const cookie = cookieOf(await login('ana@x.com', PASSWORD));
    ctx.clock.set('2026-11-06T19:59:59');
    expect((await ctx.withCookie(cookie).get('/api/auth/me')).statusCode).toBe(200);
    ctx.clock.set('2026-11-06T20:00:01');
    expect((await ctx.withCookie(cookie).get('/api/auth/me')).statusCode).toBe(401);
  });

  it('logout invalida la sesión', async () => {
    await setup();
    const cookie = cookieOf(await login('ana@x.com', PASSWORD));
    await ctx.withCookie(cookie).post('/api/auth/logout');
    expect((await ctx.withCookie(cookie).get('/api/auth/me')).statusCode).toBe(401);
  });

  it('rechaza contraseña de menos de 10 caracteres con fields.password', async () => {
    const res = await ctx.anon.post('/api/setup', { name: 'Ana', email: 'a@x.com', password: '123456789' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.password).toBeTruthy();
  });

  it('credenciales erróneas y cuenta inactiva dan el mismo 401', async () => {
    await setup();
    const inactive = await ctx.makeUser({ role: 'COLLABORATOR', email: 'c@x.com', password: PASSWORD, active: false });
    const wrong = await login('ana@x.com', 'incorrecta-123');
    const off = await login(inactive.email, PASSWORD);
    const none = await login('nadie@x.com', PASSWORD);
    for (const res of [wrong, off, none]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('invalid_credentials');
    }
  });

  it('tras 5 fallos responde 429, incluso con la contraseña correcta', async () => {
    await setup();
    for (let i = 0; i < 5; i++) expect((await login('ana@x.com', 'incorrecta-123')).statusCode).toBe(401);
    const res = await login('ana@x.com', PASSWORD);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('a los 15 minutos permite intentar de nuevo', async () => {
    await setup();
    ctx.clock.set('2026-11-06T08:00:00');
    for (let i = 0; i < 5; i++) await login('ana@x.com', 'incorrecta-123');
    ctx.clock.set('2026-11-06T08:14:59');
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(429);
    ctx.clock.set('2026-11-06T08:15:01');
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(200);
  });

  it('un inicio correcto reinicia el contador de fallos', async () => {
    await setup();
    for (let i = 0; i < 4; i++) await login('ana@x.com', 'incorrecta-123');
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await login('ana@x.com', 'incorrecta-123');
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(200);
  });

  it('los fallos de hace más de 15 minutos no cuentan', async () => {
    await setup();
    ctx.clock.set('2026-11-06T08:00:00');
    for (let i = 0; i < 4; i++) await login('ana@x.com', 'incorrecta-123');
    ctx.clock.set('2026-11-06T08:16:00');
    expect((await login('ana@x.com', 'incorrecta-123')).statusCode).toBe(401);
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(200);
  });

  it('purge borra las ventanas vencidas y conserva los bloqueos vigentes', async () => {
    const limiter = new LoginLimiter(ctx.prisma);
    const start = new Date('2026-11-06T08:00:00Z');
    await limiter.recordFailure('viejo', start);
    for (let i = 0; i < 5; i++) await limiter.recordFailure('bloqueado', new Date('2026-11-06T08:10:00Z'));
    await limiter.recordFailure('reciente', new Date('2026-11-06T08:19:00Z'));
    expect(await limiter.purge(new Date('2026-11-06T08:20:00Z'))).toBe(1);
    const keys = (await ctx.prisma.loginAttempt.findMany()).map((a) => a.key).sort();
    expect(keys).toEqual(['bloqueado', 'reciente']);
  });

  it('fallos simultáneos no se pierden', async () => {
    await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => login('ana@x.com', 'incorrecta-123')));
    for (const res of results) expect(res.statusCode).toBe(401);
    expect((await login('ana@x.com', PASSWORD)).statusCode).toBe(429);
  });

  describe('con código de configuración inicial', () => {
    let guarded: TestCtx;
    beforeEach(async () => {
      guarded = await createTestApp({ setupToken: 'abc' });
    });
    afterEach(() => guarded.close());
    const body = { name: 'Ana', email: 'ana@x.com', password: PASSWORD };

    it('el estado indica que se pide el código', async () => {
      expect((await guarded.anon.get('/api/setup/status')).json()).toEqual({ needsSetup: true, requiresToken: true });
      expect((await ctx.anon.get('/api/setup/status')).json()).toEqual({ needsSetup: true, requiresToken: false });
    });

    it('sin código o con otro valor responde 403 y no crea la cuenta', async () => {
      for (const token of [undefined, 'otro', 'abcd', '']) {
        const res = await guarded.anon.post('/api/setup', { ...body, token });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('setup_token_invalid');
      }
      expect(await guarded.prisma.user.count()).toBe(0);
    });

    it('con el código correcto crea la cuenta', async () => {
      expect((await guarded.anon.post('/api/setup', { ...body, token: 'abc' })).statusCode).toBe(201);
    });
  });

  it('con secureCookies la cookie de sesión es Secure; sin la opción, no', async () => {
    await setup();
    expect(String((await login('ana@x.com', PASSWORD)).headers['set-cookie'])).not.toContain('Secure');
    const secure = await createTestApp({ secureCookies: true });
    try {
      await secure.anon.post('/api/setup', { name: 'Ana', email: 'ana@x.com', password: PASSWORD });
      const header = String((await secure.anon.post('/api/auth/login', { email: 'ana@x.com', password: PASSWORD })).headers['set-cookie']);
      expect(header).toContain('Secure');
    } finally {
      await secure.close();
    }
  });

  it('las respuestas de la API traen cabeceras de seguridad', async () => {
    for (const res of [await ctx.anon.get('/api/setup/status'), await ctx.anon.get('/api/auth/me'), await ctx.anon.get('/api/no-existe')]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeTruthy();
    }
  });

  it('con mustChangePassword solo permite me, logout y change-password', async () => {
    const c = await ctx.makeUser({ role: 'COLLABORATOR', mustChangePassword: true });
    ctx.app.get('/api/__protected', (c) => c.json({ ok: true }));
    const res = await ctx.as(c).get('/api/__protected');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('password_change_required');
    expect((await ctx.as(c).get('/api/auth/me')).statusCode).toBe(200);
  });

  it('change-password exige la actual', async () => {
    const u = await ctx.makeUser({ role: 'PM', password: PASSWORD });
    const res = await ctx.as(u).post('/api/auth/change-password', { currentPassword: 'mala-clave-1', newPassword: 'nueva-clave-larga' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields.currentPassword).toBeTruthy();
  });

  it('change-password limpia la obligación e invalida las demás sesiones', async () => {
    const u = await ctx.makeUser({ role: 'COLLABORATOR', password: PASSWORD, mustChangePassword: true });
    const other = ctx.as(u);
    await other.get('/api/auth/me');
    const mine = cookieOf(await login(u.email, PASSWORD));
    const res = await ctx.withCookie(mine).post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'nueva-clave-larga' });
    expect(res.statusCode).toBe(200);
    expect(res.json().mustChangePassword).toBe(false);
    expect((await ctx.withCookie(mine).get('/api/auth/me')).statusCode).toBe(200);
    expect((await login(u.email, 'nueva-clave-larga')).statusCode).toBe(200);
    expect((await ctx.prisma.session.count({ where: { userId: u.id } }))).toBe(2);
  });

  it('sin sesión requireUser responde 401', async () => {
    const res = await ctx.anon.get('/api/auth/me');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });
});
