import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Nombre de la base plantilla, ya migrada. */
    templateDb: string;
    /** Conexión de administración (TEST_DATABASE_URL). */
    adminUrl: string;
  }
}

/** La misma conexión apuntando a otra base del servidor. */
export function databaseUrlFor(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error('Falta TEST_DATABASE_URL. Arranca PostgreSQL con "docker compose up -d" y define la variable (ver .env.example).');
  }
  const templateDb = `pm_template_${process.pid}`;
  const templateUrl = databaseUrlFor(adminUrl, templateDb);

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${templateDb}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${templateDb}"`);

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: templateUrl, DIRECT_URL: templateUrl },
    stdio: 'pipe',
  });
  const template = new PrismaClient({ datasources: { db: { url: templateUrl } } });
  await template.$executeRawUnsafe('ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY');
  await template.$disconnect();

  project.provide('templateDb', templateDb);
  project.provide('adminUrl', adminUrl);

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${templateDb}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
