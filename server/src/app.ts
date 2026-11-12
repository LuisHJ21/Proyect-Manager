import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { registerAuthHook } from './auth/guards';
import { errorHandler, notFoundHandler } from './errors';
import type { App, AppEnv, Ctx, Deps } from './http';
import { authRoutes } from './routes/auth';
import { calendarRoutes } from './routes/calendar';
import { charterRoutes } from './routes/charter';
import { dashboardRoutes } from './routes/dashboard';
import { indicatorRoutes } from './routes/indicators';
import { memberRoutes } from './routes/members';
import { projectRoutes } from './routes/projects';
import { raciRoutes } from './routes/raci';
import { registerRoutes } from './routes/registers';
import { userRoutes } from './routes/users';

export type BuildAppOptions = {
  prisma: PrismaClient;
  dataDir: string;
  now?: () => Date;
  clientIp?: (c: Ctx) => string;
};

export function buildApp(opts: BuildAppOptions): App {
  const app = new Hono<AppEnv>();
  const deps: Deps = {
    prisma: opts.prisma,
    dataDir: opts.dataDir,
    now: opts.now ?? (() => new Date()),
    clientIp: opts.clientIp ?? (() => '127.0.0.1'),
  };

  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.use(async (c, next) => {
    c.set('deps', deps);
    c.set('user', null);
    c.set('sessionToken', null);
    await next();
  });
  registerAuthHook(app);
  authRoutes(app);
  userRoutes(app);
  projectRoutes(app);
  memberRoutes(app);
  charterRoutes(app);
  registerRoutes(app);
  raciRoutes(app);
  indicatorRoutes(app);
  dashboardRoutes(app);
  calendarRoutes(app);

  return app;
}
