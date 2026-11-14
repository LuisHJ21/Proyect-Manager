import type { PrismaClient } from '@prisma/client';
import { fieldError } from '../errors';

/** El responsable de un riesgo o incidente debe ser miembro del proyecto y no tener el perfil Observador. */
export async function assertOwnerCanOwn(prisma: PrismaClient, projectId: string, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: ownerId } },
    include: { user: { select: { role: true } } },
  });
  if (!member) throw fieldError('ownerId', 'El responsable debe ser miembro del proyecto');
  if (member.user.role === 'OBSERVER') throw fieldError('ownerId', 'Un observador no puede ser responsable');
}
