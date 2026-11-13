import { Prisma } from '@prisma/client';

/**
 * Instante como `timestamp` en UTC para SQL crudo. Las columnas DateTime de Prisma son `timestamp(3)`
 * sin zona y guardan UTC; así la comparación no depende de la zona de la sesión de PostgreSQL.
 */
export const utc = (date: Date) => Prisma.sql`(CAST(${date.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`;
