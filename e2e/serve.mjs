// Arranca la aplicación compilada con una carpeta de datos nueva para la prueba de extremo a extremo.
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = join(tmpdir(), 'gestor-pmbok-e2e');
rmSync(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;

await import('../server/scripts/start.mjs');
