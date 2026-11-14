import { localToday } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { registerAuthHook } from './auth/guards';
import { registerClosedGuard } from './closedGuard';
import { errorHandler, notFoundHandler } from './errors';
import type { App, AppEnv, Ctx, Deps } from './http';
import { DiskFileStore } from './storage/diskFileStore';
import type { FileStore } from './storage/fileStore';
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
import { localUploadRoutes } from './routes/localUploads';
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
  files: FileStore;
  now?: () => Date;
  /** Zona para calcular "hoy" (APP_TIMEZONE). Sin ella, la del sistema. */
  timeZone?: string;
  clientIp?: (c: Ctx) => string;
  /** Cookie de sesión con `Secure`. Activar en producción. */
  secureCookies?: boolean;
  /** Si existe, `POST /api/setup` exige este código. */
  setupToken?: string;
};

/** Dependencias de la API a partir de sus opciones. La tarea diaria usa las mismas. */
export function createDeps(opts: BuildAppOptions): Deps {
  const now = opts.now ?? (() => new Date());
  return {
    prisma: opts.prisma,
    files: opts.files,
    now,
    today: () => localToday(now(), opts.timeZone),
    clientIp: opts.clientIp ?? (() => '127.0.0.1'),
    secureCookies: opts.secureCookies ?? false,
    setupToken: opts.setupToken || undefined,
  };
}

export function buildApp(opts: BuildAppOptions): App {
  const app = new Hono<AppEnv>();
  const deps = createDeps(opts);

  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.use('/api/*', secureHeaders());
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
  if (opts.files instanceof DiskFileStore) localUploadRoutes(app, opts.files);
  indicatorRoutes(app);
  dashboardRoutes(app);
  calendarRoutes(app);

  return app;
}
