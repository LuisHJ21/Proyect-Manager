import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app';
import { databaseUrl, resolveDataDir, resolvePort } from './config';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../..');
const dataDir = resolveDataDir(process.env, rootDir);
const port = resolvePort(process.env);
const clientDist = resolve(rootDir, 'client/dist');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl(dataDir) } } });
const app = await buildApp({ prisma, dataDir, clientDist, logger: { level: 'warn' } });

await app.listen({ host: '0.0.0.0', port });

console.log(`Gestor de proyectos en marcha:`);
console.log(`  En este equipo: http://localhost:${port}`);
for (const addresses of Object.values(networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (address.family === 'IPv4' && !address.internal) {
      console.log(`  En la red local: http://${address.address}:${port}`);
    }
  }
}
