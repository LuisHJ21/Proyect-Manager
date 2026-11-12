import type { PrismaClient, User } from '@prisma/client';
import type { Context, Hono } from 'hono';
import { AppError } from './errors';

export type Deps = {
  prisma: PrismaClient;
  dataDir: string;
  now(): Date;
  /** Fecha de hoy (YYYY-MM-DD) en la zona configurada. */
  today(): string;
  clientIp(c: Ctx): string;
};
export type AppEnv = { Variables: { deps: Deps; user: User | null; sessionToken: string | null } };
export type App = Hono<AppEnv>;
export type Ctx = Context<AppEnv>;

/** Cuerpo JSON de la petición; `undefined` si no hay cuerpo; AppError 400 `bad_request` si no es JSON válido. */
export async function readBody(c: Ctx): Promise<unknown> {
  if (!c.req.raw.body) return undefined;
  const text = await c.req.text();
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'bad_request', 'Solicitud inválida');
  }
}

/** Rutas registradas, sin middlewares. */
export function listRoutes(app: App): { method: string; url: string }[] {
  const seen = new Set<string>();
  const routes: { method: string; url: string }[] = [];
  for (const route of app.routes) {
    if (route.method === 'ALL') continue;
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ method: route.method, url: route.path });
  }
  return routes;
}

/** Parámetros de consulta como los entregaba Fastify: un valor repetido llega como arreglo. */
export function readQuery(c: Ctx): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(c.req.queries())) {
    query[key] = values.length === 1 ? values[0]! : values;
  }
  return query;
}
