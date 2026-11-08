import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './passwords';
import { deleteUserSessions } from './sessions';

/** Contraseña temporal aleatoria de 16 caracteres, sin símbolos ambiguos al copiarla. */
const makeTemporaryPassword = () => randomBytes(12).toString('base64url');

/**
 * Restablece la contraseña de un usuario desde la terminal del servidor.
 * Deja una contraseña temporal que debe cambiarse al entrar, reactiva la cuenta y cierra sus sesiones.
 */
export async function resetPassword(prisma: PrismaClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error(`No existe un usuario con el correo ${normalized}`);
  const temporaryPassword = makeTemporaryPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, active: true },
  });
  await deleteUserSessions(prisma, user.id);
  return { temporaryPassword, user: { name: user.name, email: user.email } };
}

/** Project Managers registrados, para recordar con qué correo entrar. */
export const listProjectManagers = (prisma: PrismaClient) =>
  prisma.user.findMany({ where: { role: 'PM' }, select: { name: true, email: true, active: true }, orderBy: { name: 'asc' } });
