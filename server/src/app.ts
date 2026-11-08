import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { MAX_FILE_BYTES } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerAuthHook } from './auth/guards';
import { errorHandler } from './errors';
import { attachmentRoutes } from './routes/attachments';
import { authRoutes } from './routes/auth';
import { calendarRoutes } from './routes/calendar';
import { charterRoutes } from './routes/charter';
import { dashboardRoutes } from './routes/dashboard';
import { dependencyRoutes } from './routes/dependencies';
import { indicatorRoutes } from './routes/indicators';
import { memberRoutes } from './routes/members';
import { projectRoutes } from './routes/projects';
import { registerRoutes } from './routes/registers';
import { raciRoutes } from './routes/raci';
import { changeRequestRoutes } from './routes/changeRequests';
import { taskStepRoutes } from './routes/taskSteps';
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
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 }, throwFileSizeLimit: false });
  registerAuthHook(app);
  await authRoutes(app);
  await userRoutes(app);
  await projectRoutes(app);
  await memberRoutes(app);
  await charterRoutes(app);
  await registerRoutes(app);
  await raciRoutes(app);
  await changeRequestRoutes(app);
  await taskRoutes(app);
  await taskStepRoutes(app);
  await dependencyRoutes(app);
  await attachmentRoutes(app);
  await indicatorRoutes(app);
  await dashboardRoutes(app);
  await calendarRoutes(app);

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
