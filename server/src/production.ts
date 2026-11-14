import { PrismaClient } from '@prisma/client';
import { getConnInfo } from 'hono/netlify';
import { buildApp, createDeps, type BuildAppOptions } from './app';
import type { App, Deps } from './http';
import { SupabaseFileStore } from './storage/supabaseFileStore';

/** Variables sin valor por omisión (sección 8 de la especificación). */
const REQUIRED = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SETUP_TOKEN'] as const;

/** Una sola conexión por instancia de la función: Netlify reutiliza el módulo entre peticiones. */
let prisma: PrismaClient | undefined;

function productionOptions(env: NodeJS.ProcessEnv): BuildAppOptions {
  for (const name of REQUIRED) {
    if (!env[name]) throw new Error(`Falta la variable ${name}`);
  }
  const supabaseUrl = env.SUPABASE_URL!.trim();
  // No es secreta: mostrar el valor recibido ahorra adivinar qué llegó desde el panel de Netlify.
  if (!/^https:\/\/[^\s/"']+\/?$/.test(supabaseUrl)) {
    throw new Error(`SUPABASE_URL debe ser la dirección del proyecto, como https://<id>.supabase.co. Se recibió: ${JSON.stringify(env.SUPABASE_URL)}`);
  }
  prisma ??= new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  return {
    prisma,
    files: new SupabaseFileStore({
      url: supabaseUrl,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
      bucket: env.SUPABASE_BUCKET || 'anexos',
    }),
    timeZone: env.APP_TIMEZONE || 'America/Lima',
    secureCookies: true,
    setupToken: env.SETUP_TOKEN,
    // Fuera de Netlify (pruebas) no hay contexto de conexión.
    clientIp: (c) => (c.env ? getConnInfo(c).remote.address : undefined) ?? '127.0.0.1',
  };
}

/** Dependencias de producción; las usa la tarea diaria. */
export function createProductionDeps(env: NodeJS.ProcessEnv): Deps {
  return createDeps(productionOptions(env));
}

/** API de producción para la función de Netlify. */
export function createProductionApp(env: NodeJS.ProcessEnv): App {
  return buildApp(productionOptions(env));
}
