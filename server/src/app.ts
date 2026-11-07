import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerAuthHook } from './auth/guards';
import { errorHandler } from './errors';
import { authRoutes } from './routes/auth';
import { charterRoutes } from './routes/charter';
import { memberRoutes } from './routes/members';
import { projectRoutes } from './routes/projects';
import { registerRoutes } from './routes/registers';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    dataDir: string;
    now(): Date;
  }
}

export type BuildAppOptions = {
  prisma: PrismaClient;
  dataDir: string;
  now?: () => Date;
  clientDist?: string;
  logger?: FastifyServerOptions['logger'];
};

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const now = opts.now ?? (() => new Date());

  app.decorate('prisma', opts.prisma);
  app.decorate('dataDir', opts.dataDir);
  app.decorate('now', () => now());

  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  registerAuthHook(app);
  await authRoutes(app);
  await userRoutes(app);
  await projectRoutes(app);
  await memberRoutes(app);
  await charterRoutes(app);
  await registerRoutes(app);
  await taskRoutes(app);

  if (opts.clientDist) {
    await app.register(fastifyStatic, { root: opts.clientDist, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url === '/api' || req.url.startsWith('/api/');
    if (!isApi && req.method === 'GET' && opts.clientDist) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: { code: 'not_found', message: 'No encontrado' } });
  });

  return app;
}
