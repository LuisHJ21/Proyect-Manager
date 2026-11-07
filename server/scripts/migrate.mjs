// Crea la carpeta de datos y aplica las migraciones pendientes de la base de datos.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(serverDir, '../data');

mkdirSync(dataDir, { recursive: true });
execSync('npx prisma migrate deploy', {
  cwd: serverDir,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DATABASE_URL: `file:${dataDir.replace(/\\/g, '/')}/app.db` },
});
