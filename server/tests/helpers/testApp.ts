import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Role } from '@pm/shared';
import { PrismaClient, type User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../../src/app';
import { hashPassword } from '../../src/auth/passwords';
import { createSession } from '../../src/auth/sessions';
import { databaseUrl } from '../../src/config';

type Headers = Record<string, string>;

function httpClient(app: FastifyInstance, cookie?: string) {
  const send =
    (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') =>
    (url: string, body?: unknown, headers: Headers = {}) =>
      app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: body as object }),
        headers: { ...(cookie ? { cookie } : {}), ...headers },
      });
  return { get: send('GET'), post: send('POST'), put: send('PUT'), patch: send('PATCH'), delete: send('DELETE') };
}

export type HttpClient = ReturnType<typeof httpClient>;

export async function createTestApp(opts: { clientDist?: string } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'pm-test-'));
  copyFileSync(inject('templateDb'), join(dataDir, 'app.db'));
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(dataDir) } } });

  let current = new Date('2026-11-06T12:00:00');
  let userCount = 0;
  const app = await buildApp({ prisma, dataDir, now: () => current, clientDist: opts.clientDist });

  return {
    app,
    prisma,
    dataDir,
    clock: {
      set(iso: string) {
        current = new Date(iso);
      },
    },
    anon: httpClient(app),
    withCookie: (cookie: string) => httpClient(app, cookie),
    async makeUser(input: {
      role: Role;
      name?: string;
      email?: string;
      password?: string;
      active?: boolean;
      mustChangePassword?: boolean;
    }) {
      userCount += 1;
      return prisma.user.create({
        data: {
          role: input.role,
          name: input.name ?? `Usuario ${userCount}`,
          email: input.email ?? `usuario${userCount}@x.com`,
          passwordHash: input.password ? await hashPassword(input.password) : 'sin-contraseña',
          active: input.active ?? true,
          mustChangePassword: input.mustChangePassword ?? false,
        },
      });
    },
    async makeProject(input: { name?: string; members?: User[]; plannedBudgetCents?: number; currency?: string } = {}) {
      return prisma.project.create({
        data: {
          name: input.name ?? 'Proyecto',
          plannedBudgetCents: input.plannedBudgetCents ?? 0,
          currency: input.currency ?? 'USD',
          charter: { create: {} },
          members: { create: (input.members ?? []).map((m) => ({ userId: m.id })) },
        },
      });
    },
    async makeTask(
      projectId: string,
      input: { title?: string; assignees?: User[]; status?: string; progress?: number; startDate?: string; dueDate?: string } = {},
    ) {
      const { assignees = [], title = 'Tarea', ...rest } = input;
      return prisma.task.create({
        data: { projectId, title, ...rest, assignees: { create: assignees.map((a) => ({ userId: a.id })) } },
      });
    },
    /** Cliente con una sesión creada directamente, sin pasar por el inicio de sesión. */
    as(user: User): HttpClient {
      const lazyCookie = createSession(prisma, user.id, current).then((token) => `pm_session=${token}`);
      const wrap =
        (method: keyof HttpClient) =>
        async (url: string, body?: unknown, headers?: Headers) =>
          httpClient(app, await lazyCookie)[method](url, body, headers);
      return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') } as HttpClient;
    },
    async close() {
      await app.close();
      await prisma.$disconnect();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

export type TestCtx = Awaited<ReturnType<typeof createTestApp>>;
