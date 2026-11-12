import { localToday } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { registerAuthHook } from './auth/guards';
import { registerClosedGuard } from './closedGuard';
import { errorHandler, notFoundHandler } from './errors';
import type { App, AppEnv, Ctx, Deps } from './http';
import { attachmentRoutes } from './routes/attachments';
import { authRoutes } from './routes/auth';
import { calendarRoutes } from './routes/calendar';
import { changeRequestRoutes } from './routes/changeRequests';
import { charterRoutes } from './routes/charter';
import { closureRoutes } from './routes/closure';
import { dashboardRoutes } from './routes/dashboard';
import { decisionRoutes } from './routes/decisions';
import { deliverableReviewRoutes } from './routes/deliverableReviews';
import { deliverableRoutes } from './routes/deliverables';
import { dependencyRoutes } from './routes/dependencies';
import { incidentRoutes } from './routes/incidents';
import { indicatorRoutes } from './routes/indicators';
import { lessonRoutes } from './routes/lessons';
import { memberRoutes } from './routes/members';
import { performanceRoutes } from './routes/performance';
import { projectRoutes } from './routes/projects';
import { raciRoutes } from './routes/raci';
import { registerRoutes } from './routes/registers';
import { taskStepRoutes } from './routes/taskSteps';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';

export type BuildAppOptions = {
  prisma: PrismaClient;
  dataDir: string;
  now?: () => Date;
  /** Zona para calcular "hoy" (APP_TIMEZONE). Sin ella, la del sistema. */
  timeZone?: string;
  clientIp?: (c: Ctx) => string;
};

export function buildApp(opts: BuildAppOptions): App {
  const app = new Hono<AppEnv>();
  const now = opts.now ?? (() => new Date());
  const deps: Deps = {
    prisma: opts.prisma,
    dataDir: opts.dataDir,
    now,
    today: () => localToday(now(), opts.timeZone),
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
  registerClosedGuard(app);
  authRoutes(app);
  userRoutes(app);
  projectRoutes(app);
  memberRoutes(app);
  charterRoutes(app);
  registerRoutes(app);
  raciRoutes(app);
  changeRequestRoutes(app);
  performanceRoutes(app);
  incidentRoutes(app);
  decisionRoutes(app);
  deliverableRoutes(app);
  deliverableReviewRoutes(app);
  closureRoutes(app);
  lessonRoutes(app);
  taskRoutes(app);
  taskStepRoutes(app);
  dependencyRoutes(app);
  attachmentRoutes(app);
  indicatorRoutes(app);
  dashboardRoutes(app);
  calendarRoutes(app);

  return app;
}
