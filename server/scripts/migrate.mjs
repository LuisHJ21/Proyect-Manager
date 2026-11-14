// Aplica las migraciones pendientes. Prisma usa DIRECT_URL (conexión directa, sin pooler).
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

execSync('npx prisma migrate deploy', { cwd: serverDir, stdio: 'inherit' });
