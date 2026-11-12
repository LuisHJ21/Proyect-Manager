import { serveStatic } from '@hono/node-server/serve-static';
import type { App } from './http';

const isApi = (path: string) => path === '/api' || path.startsWith('/api/');

/** Sirve la interfaz compilada y entrega `index.html` en cualquier GET que no sea de la API. */
export function withStatic(app: App, clientDist: string): App {
  const files = serveStatic({ root: clientDist });
  const index = serveStatic({ root: clientDist, path: 'index.html' });
  app.get('*', async (c, next) => (isApi(c.req.path) ? next() : files(c, next)));
  app.get('*', async (c, next) => (isApi(c.req.path) ? next() : index(c, next)));
  return app;
}
