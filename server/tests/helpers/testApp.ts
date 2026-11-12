import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Role } from '@pm/shared';
import { PrismaClient, type User } from '@prisma/client';
import { inject } from 'vitest';
import { buildApp, type BuildAppOptions } from '../../src/app';
import type { App } from '../../src/http';
import { hashPassword } from '../../src/auth/passwords';
import { createSession } from '../../src/auth/sessions';
import { databaseUrlFor } from './globalSetup';

type Headers = Record<string, string>;

export type TestResponse = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  cookies: { name: string; value: string }[];
  json(): any;
};

/** Adapta la respuesta de `app.request` a la forma que leen las pruebas. */
async function toTestResponse(res: Response): Promise<TestResponse> {
  const body = await res.text();
  const headers: Record<string, string | string[]> = {};
  res.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value;
  });
  const setCookies = res.headers.getSetCookie();
  if (setCookies.length > 0) headers['set-cookie'] = setCookies.length === 1 ? setCookies[0]! : setCookies;
  const cookies = setCookies.map((line) => {
    const [pair] = line.split(';');
    const eq = pair!.indexOf('=');
    return { name: pair!.slice(0, eq).trim(), value: decodeURIComponent(pair!.slice(eq + 1).trim()) };
  });
  return { statusCode: res.status, headers, body, cookies, json: () => JSON.parse(body) };
}

function httpClient(app: App, cookie?: string) {
  const send =
    (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') =>
    async (url: string, body?: unknown, headers: Headers = {}) => {
      const isRaw = body instanceof Uint8Array || typeof body === 'string';
      const init: RequestInit = {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined && !isRaw ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: isRaw ? (body as BodyInit) : JSON.stringify(body) }),
      };
      return toTestResponse(await app.request(url, init));
    };
  return { get: send('GET'), post: send('POST'), put: send('PUT'), patch: send('PATCH'), delete: send('DELETE') };
}

export type HttpClient = ReturnType<typeof httpClient>;

let adminClient: PrismaClient | undefined;
/** Conexión de administración del proceso de pruebas: crea y borra las bases de cada prueba. */
function admin(): PrismaClient {
  adminClient ??= new PrismaClient({ datasources: { db: { url: inject('adminUrl') } } });
  return adminClient;
}

export async function createTestApp(opts: { build?: (options: BuildAppOptions) => App } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'pm-test-'));
  const database = `pm_test_${randomBytes(6).toString('hex')}`;
  await admin().$executeRawUnsafe(`CREATE DATABASE "${database}" TEMPLATE "${inject('templateDb')}"`);
  const url = new URL(databaseUrlFor(inject('adminUrl'), database));
  url.searchParams.set('connection_limit', '5');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

  let current = new Date('2026-11-06T12:00:00');
  let userCount = 0;
  const app = (opts.build ?? buildApp)({ prisma, dataDir, now: () => current });

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
    makeStep(taskId: string, input: { title?: string; done?: boolean; assigneeId?: string } = {}) {
      return prisma.taskStep.create({ data: { taskId, title: input.title ?? 'Paso', done: input.done ?? false, assigneeId: input.assigneeId } });
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
      await prisma.$disconnect();
      await admin().$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

export type TestCtx = Awaited<ReturnType<typeof createTestApp>>;
