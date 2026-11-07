import { resolve } from 'node:path';

export function databaseUrl(dataDir: string): string {
  return `file:${dataDir.replace(/\\/g, '/')}/app.db?connection_limit=1`;
}

export function resolveDataDir(env: NodeJS.ProcessEnv, rootDir: string): string {
  return env.DATA_DIR ? resolve(env.DATA_DIR) : resolve(rootDir, 'data');
}

export function resolvePort(env: NodeJS.ProcessEnv): number {
  return Number(env.PORT ?? 3000);
}
