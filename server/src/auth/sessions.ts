import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';

export const SESSION_COOKIE = 'pm_session';
export const SESSION_HOURS = 12;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(prisma: PrismaClient, userId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_HOURS * 3_600_000),
    },
  });
  return token;
}

export async function findSessionUser(prisma: PrismaClient, token: string, now: Date): Promise<User | null> {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt <= now || !session.user.active) return null;
  return session.user;
}

export async function deleteSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function deleteUserSessions(prisma: PrismaClient, userId: string, exceptToken?: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptToken ? { tokenHash: { not: hashToken(exceptToken) } } : {}) },
  });
}
