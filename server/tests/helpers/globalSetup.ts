import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import { databaseUrl } from '../../src/config';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string;
  }
}

export default function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-template-'));
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl(dir) },
    stdio: 'pipe',
  });
  project.provide('templateDb', join(dir, 'app.db'));
  return () => rmSync(dir, { recursive: true, force: true });
}
