import { CLOSED_PROJECT_STATUS } from '@pm/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors';

declare module 'fastify' {
  interface FastifyInstance {
    /** Todas las rutas registradas; la prueba de cobertura del guardia las recorre. */
    routeList: { method: string; url: string }[];
  }
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const under = (pattern: string, prefix: string) => pattern === prefix || pattern.startsWith(`${prefix}/`);

/** Rutas (por su patrón, no por la URL recibida) que siguen permitidas con el proyecto cerrado. */
function isException(method: string, pattern: string) {
  if (method === 'DELETE' && pattern === '/api/projects/:id') return true;
  if (under(pattern, '/api/projects/:id/lessons')) return true;
  return method === 'POST' && pattern === '/api/projects/:id/reopen';
}

/**
 * El proyecto afectado sale del patrón de la ruta y de los parámetros ya decodificados por Fastify,
 * nunca de la URL cruda: así un id con caracteres codificados (%61…) no se salta el guardia.
 */
async function projectIdOf(req: FastifyRequest, pattern: string): Promise<string | null> {
  const id = (req.params as { id?: string } | undefined)?.id;
  if (!id) return null;
  const { prisma } = req.server;
  if (under(pattern, '/api/projects/:id')) return id;
  if (under(pattern, '/api/tasks/:id')) return (await prisma.task.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (pattern === '/api/attachments/:id') return (await prisma.attachment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  return null;
}

/**
 * Un proyecto cerrado o cancelado es de solo lectura: toda escritura sobre él responde 409.
 * Sin sesión, sin acceso o con un id inexistente se deja pasar para que la ruta responda como siempre (401/404).
 */
export function registerClosedGuard(app: FastifyInstance) {
  app.decorate('routeList', [] as { method: string; url: string }[]);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) app.routeList.push({ method, url: route.url });
  });

  app.addHook('preHandler', async (req) => {
    if (!WRITE_METHODS.has(req.method) || !req.user) return;
    const pattern = req.routeOptions.url;
    if (!pattern || isException(req.method, pattern)) return;
    const projectId = await projectIdOf(req, pattern);
    if (!projectId) return;
    const project = await app.prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
    if (!project || !(CLOSED_PROJECT_STATUS as readonly string[]).includes(project.status)) return;
    if (req.user.role !== 'PM') {
      const member = await app.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: req.user.id } } });
      if (!member) return;
    }
    throw new AppError(409, 'project_closed', 'El proyecto está cerrado. Reábrelo para hacer cambios.');
  });
}
