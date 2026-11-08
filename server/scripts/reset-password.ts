// Restablece la contraseña de un usuario desde la terminal del equipo que aloja la aplicación.
// Uso: npm run reset-password -- correo@ejemplo.com   (sin correo, lista los Project Managers)
import { PrismaClient } from '@prisma/client';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProjectManagers, resetPassword } from '../src/auth/resetPassword';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(serverDir, '../data');
const prisma = new PrismaClient({ datasources: { db: { url: `file:${dataDir.replace(/\\/g, '/')}/app.db` } } });

const email = process.argv[2];
try {
  if (!email) {
    const managers = await listProjectManagers(prisma);
    console.log('Indica el correo del usuario. Project Managers registrados:');
    for (const m of managers) console.log(`  ${m.email}  (${m.name}${m.active ? '' : ', desactivado'})`);
    console.log('\nEjemplo: npm run reset-password -- correo@ejemplo.com');
  } else {
    const { temporaryPassword, user } = await resetPassword(prisma, email);
    console.log(`Contraseña restablecida para ${user.name} (${user.email}).`);
    console.log(`Contraseña temporal: ${temporaryPassword}`);
    console.log('Al entrar, la aplicación te pedirá cambiarla. Se cerraron sus sesiones abiertas.');
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
