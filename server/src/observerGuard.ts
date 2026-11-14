import { AppError } from './errors';
import type { App } from './http';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
/** Lo único que un observador puede enviar: cerrar sesión y cambiar su contraseña. */
const ALLOWED = new Set(['POST /api/auth/logout', 'POST /api/auth/change-password']);

/** El perfil Observador es de solo lectura: toda escritura suya responde 403 antes de llegar a la ruta. */
export function registerObserverGuard(app: App) {
  app.use('/api/*', async (c, next) => {
    const user = c.var.user;
    if (user?.role === 'OBSERVER' && WRITE_METHODS.has(c.req.method) && !ALLOWED.has(`${c.req.method} ${c.req.path}`)) {
      throw new AppError(403, 'observer_read_only', 'Tu perfil es de solo lectura');
    }
    await next();
  });
}
