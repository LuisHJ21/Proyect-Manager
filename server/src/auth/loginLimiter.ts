import { Prisma, type PrismaClient } from '@prisma/client';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;

/** Instante como `timestamp` en UTC, sin depender de la zona de la sesión de PostgreSQL. */
const utc = (date: Date) => Prisma.sql`(CAST(${date.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`;

/** Fallos de inicio de sesión por clave (correo|IP), guardados en la base para que valgan entre funciones. */
export class LoginLimiter {
  constructor(private readonly prisma: PrismaClient) {}

  /** Segundos restantes de bloqueo, o 0 si se puede intentar. */
  async retryAfterSeconds(key: string, now: Date): Promise<number> {
    const attempt = await this.prisma.loginAttempt.findUnique({ where: { key } });
    if (!attempt?.blockedUntil) return 0;
    const remaining = attempt.blockedUntil.getTime() - now.getTime();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /** Suma un fallo en una sola sentencia, para que los intentos simultáneos no se pierdan. */
  async recordFailure(key: string, now: Date): Promise<void> {
    const windowExpired = Prisma.sql`"LoginAttempt"."windowStart" <= ${utc(new Date(now.getTime() - WINDOW_MS))}`;
    const failures = Prisma.sql`CASE WHEN ${windowExpired} THEN 1 ELSE "LoginAttempt"."failures" + 1 END`;
    await this.prisma.$executeRaw`
      INSERT INTO "LoginAttempt" ("key", "failures", "windowStart", "blockedUntil")
      VALUES (${key}, 1, ${utc(now)}, NULL)
      ON CONFLICT ("key") DO UPDATE SET
        "failures" = ${failures},
        "windowStart" = CASE WHEN ${windowExpired} THEN ${utc(now)} ELSE "LoginAttempt"."windowStart" END,
        "blockedUntil" = CASE
          WHEN ${failures} >= ${MAX_FAILURES} THEN ${utc(new Date(now.getTime() + BLOCK_MS))}
          WHEN ${windowExpired} THEN NULL
          ELSE "LoginAttempt"."blockedUntil"
        END`;
  }

  async reset(key: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { key } });
  }

  /** Borra las filas con la ventana vencida y sin bloqueo vigente. Devuelve cuántas borró. */
  async purge(now: Date): Promise<number> {
    const { count } = await this.prisma.loginAttempt.deleteMany({
      where: {
        windowStart: { lte: new Date(now.getTime() - WINDOW_MS) },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
      },
    });
    return count;
  }
}
