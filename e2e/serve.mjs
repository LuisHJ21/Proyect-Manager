// Arranca la aplicación compilada con una base de datos nueva (pm_e2e) para la prueba de extremo a extremo.
// Necesita PostgreSQL ("docker compose up -d") y TEST_DATABASE_URL, del entorno o del archivo .env.
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) {
  console.error('Falta TEST_DATABASE_URL. Arranca PostgreSQL con "docker compose up -d" y define la variable (ver .env.example).');
  process.exit(1);
}

const database = 'pm_e2e';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
await admin.$disconnect();

const url = new URL(adminUrl);
url.pathname = `/${database}`;
process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = url.toString();
// La prueba hace la configuración inicial sin código.
delete process.env.SETUP_TOKEN;

// Los anexos van al disco, en una carpeta nueva.
const dataDir = join(tmpdir(), 'gestor-pmbok-e2e');
rmSync(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;

await import('../server/scripts/start.mjs');
