import type { PrismaClient } from '@prisma/client';
import { matchedRoutes } from 'hono/route';
import type { Ctx } from './http';

/** Lo que los middlewares de escritura (guardias y bitácora) necesitan saber de la petición. */
export const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const under = (pattern: string, prefix: string) => pattern === prefix || pattern.startsWith(`${prefix}/`);

/** Patrón de la ruta que responderá: la primera coincidencia que no es un middleware general (`app.use`). */
export function routePatternOf(c: Ctx): string | null {
  return matchedRoutes(c).find((route) => route.method !== 'ALL')?.path ?? null;
}

/**
 * El id sale del segmento de la ruta de la petición ya decodificado, nunca de la URL cruda:
 * así un id con caracteres codificados (%61…) no se salta el guardia.
 */
export function idOf(c: Ctx): string | null {
  const segment = c.req.path.split('/')[3];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export async function projectIdOf(prisma: PrismaClient, id: string, pattern: string): Promise<string | null> {
  if (under(pattern, '/api/projects/:id')) return id;
  if (under(pattern, '/api/tasks/:id')) return (await prisma.task.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (under(pattern, '/api/attachments/:id')) return (await prisma.attachment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (pattern === '/api/local-uploads/:storedName') {
    return (await prisma.attachment.findUnique({ where: { storedName: id }, select: { projectId: true } }))?.projectId ?? null;
  }
  return null;
}
