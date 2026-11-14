import { CLOSED_PROJECT_STATUS } from '@pm/shared';
import { AppError } from './errors';
import type { App } from './http';
import { idOf, projectIdOf, routePatternOf, under, WRITE_METHODS } from './routeContext';

/** Rutas (por su patrón, no por la URL recibida) que siguen permitidas con el proyecto cerrado. */
function isException(method: string, pattern: string) {
  if (method === 'DELETE' && pattern === '/api/projects/:id') return true;
  if (under(pattern, '/api/projects/:id/lessons')) return true;
  return method === 'POST' && pattern === '/api/projects/:id/reopen';
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
