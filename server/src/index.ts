import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app';
import { resolveDatabaseUrl, resolvePort } from './config';
import { withStatic } from './static';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');
// Carpeta de anexos en disco hasta que llegue el almacén intercambiable (Task 8).
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(rootDir, 'data');
const port = resolvePort(process.env);
const clientDist = resolve(rootDir, 'client/dist');

const prisma = new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl(process.env) } } });
const api = buildApp({ prisma, dataDir, timeZone: process.env.APP_TIMEZONE, clientIp: (c) => getConnInfo(c).remote.address ?? '127.0.0.1' });
let app = api;
if (existsSync(clientDist)) app = withStatic(api, clientDist);
else console.warn('No se encontró la interfaz compilada. Ejecuta "npm run build".');

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });

console.log(`Gestor de proyectos en marcha:`);
console.log(`  En este equipo: http://localhost:${port}`);
for (const addresses of Object.values(networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (address.family === 'IPv4' && !address.internal) {
      console.log(`  En la red local: http://${address.address}:${port}`);
    }
  }
}
