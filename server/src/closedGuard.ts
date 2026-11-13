import { CLOSED_PROJECT_STATUS } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { matchedRoutes } from 'hono/route';
import { AppError } from './errors';
import type { App, Ctx } from './http';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const under = (pattern: string, prefix: string) => pattern === prefix || pattern.startsWith(`${prefix}/`);

/** Rutas (por su patrón, no por la URL recibida) que siguen permitidas con el proyecto cerrado. */
function isException(method: string, pattern: string) {
  if (method === 'DELETE' && pattern === '/api/projects/:id') return true;
  if (under(pattern, '/api/projects/:id/lessons')) return true;
  return method === 'POST' && pattern === '/api/projects/:id/reopen';
}

/** Patrón de la ruta que responderá: la primera coincidencia que no es un middleware general (`app.use`). */
function routePatternOf(c: Ctx): string | null {
  return matchedRoutes(c).find((route) => route.method !== 'ALL')?.path ?? null;
}

/**
 * El id sale del segmento de la ruta de la petición ya decodificado, nunca de la URL cruda:
 * así un id con caracteres codificados (%61…) no se salta el guardia.
 */
function idOf(c: Ctx): string | null {
  const segment = c.req.path.split('/')[3];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

async function projectIdOf(prisma: PrismaClient, id: string, pattern: string): Promise<string | null> {
  if (under(pattern, '/api/projects/:id')) return id;
  if (under(pattern, '/api/tasks/:id')) return (await prisma.task.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (under(pattern, '/api/attachments/:id')) return (await prisma.attachment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (pattern === '/api/local-uploads/:storedName') {
    return (await prisma.attachment.findUnique({ where: { storedName: id }, select: { projectId: true } }))?.projectId ?? null;
  }
  return null;
}

/**
 * Un proyecto cerrado o cancelado es de solo lectura: toda escritura sobre él responde 409.
 * Sin sesión, sin acceso o con un id inexistente se deja pasar para que la ruta responda como siempre (401/404).
 */
export function registerClosedGuard(app: App) {
  app.use('/api/*', async (c, next) => {
    const user = c.var.user;
    const pattern = WRITE_METHODS.has(c.req.method) && user ? routePatternOf(c) : null;
    const id = pattern && !isException(c.req.method, pattern) ? idOf(c) : null;
    if (user && pattern && id) {
      const { prisma } = c.var.deps;
      const projectId = await projectIdOf(prisma, id, pattern);
      const project = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }) : null;
      if (projectId && project && (CLOSED_PROJECT_STATUS as readonly string[]).includes(project.status)) {
        const member =
          user.role === 'PM' || (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } }));
        if (member) throw new AppError(409, 'project_closed', 'El proyecto está cerrado. Reábrelo para hacer cambios.');
      }
    }
    await next();
  });
}
