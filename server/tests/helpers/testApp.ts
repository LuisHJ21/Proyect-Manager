import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { buildApp } from '../../src/app';
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
    async close() {
      await app.close();
      await prisma.$disconnect();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

export type TestCtx = Awaited<ReturnType<typeof createTestApp>>;
