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
const PROJECT_PATH = /^\/api\/projects\/([^/]+)(\/.*)?$/;
const TASK_PATH = /^\/api\/tasks\/([^/]+)(\/.*)?$/;
const ATTACHMENT_PATH = /^\/api\/attachments\/([^/]+)$/;

/** Rutas que siguen permitidas con el proyecto cerrado. */
function isException(method: string, path: string) {
  const match = PROJECT_PATH.exec(path);
  if (!match) return false;
  const rest = match[2] ?? '';
  if (method === 'DELETE' && rest === '') return true;
  if (rest === '/lessons' || rest.startsWith('/lessons/')) return true;
  return method === 'POST' && rest === '/reopen';
}

async function projectIdOf(req: FastifyRequest, path: string): Promise<string | null> {
  const { prisma } = req.server;
  const project = PROJECT_PATH.exec(path);
  if (project) return project[1]!;
  const task = TASK_PATH.exec(path);
  if (task) return (await prisma.task.findUnique({ where: { id: task[1] }, select: { projectId: true } }))?.projectId ?? null;
  const attachment = ATTACHMENT_PATH.exec(path);
  if (attachment) return (await prisma.attachment.findUnique({ where: { id: attachment[1] }, select: { projectId: true } }))?.projectId ?? null;
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
    const path = req.url.split('?')[0]!;
    if (isException(req.method, path)) return;
    const projectId = await projectIdOf(req, path);
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
