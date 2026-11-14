// Restablece la contraseña de un usuario desde una terminal con acceso a la base de datos.
// Uso: npm run reset-password -- correo@ejemplo.com   (sin correo, lista los Project Managers)
// Toma DATABASE_URL del entorno o del archivo .env de la raíz del proyecto.
import { PrismaClient } from '@prisma/client';
import { listProjectManagers, resetPassword } from '../src/auth/resetPassword';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Defínela en el archivo .env de la raíz del proyecto (ver .env.example).');
  console.error('Para la base de producción usa la cadena de conexión de Supabase.');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

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
