import type { NotificationKind } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';

export type NotifyInput = {
  kind: NotificationKind;
  projectId: string;
  entityId: string;
  title: string;
  userIds: string[];
  /** Quien hizo el cambio: nunca recibe el aviso. */
  actorId?: string;
  actorName?: string;
  dedupeKey?: string;
};

/**
 * Crea un aviso por destinatario activo, sin el actor. Nunca lanza: la acción del usuario ya se hizo
 * y un aviso perdido no debe convertirla en un error. Devuelve cuántos avisos creó.
 */
export async function notify(prisma: PrismaClient, input: NotifyInput): Promise<number> {
  try {
    const candidates = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
    if (candidates.length === 0) return 0;
    const active = await prisma.user.findMany({ where: { id: { in: candidates }, active: true }, select: { id: true } });
    if (active.length === 0) return 0;
    const { count } = await prisma.notification.createMany({
      data: active.map(({ id }) => ({
        userId: id,
        projectId: input.projectId,
        kind: input.kind,
        entityId: input.entityId,
        title: input.title,
        actorName: input.actorName ?? '',
        dedupeKey: input.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
    return count;
  } catch (error) {
    console.error(`No se pudo crear el aviso ${input.kind} de ${input.entityId}`, error);
    return 0;
  }
}
