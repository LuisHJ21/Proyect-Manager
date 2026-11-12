export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  return url;
}

export function resolvePort(env: NodeJS.ProcessEnv): number {
  return Number(env.PORT ?? 3080);
}
