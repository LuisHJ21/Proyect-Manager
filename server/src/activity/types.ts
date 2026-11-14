import type { ActivityAction, ActivityEntity } from '@pm/shared';
import type { PrismaClient } from '@prisma/client';
import type { Snapshot } from '../domain/activityDiff';
import type { Ctx } from '../http';

/** Cómo registra la bitácora una ruta de escritura. Ver la sección 4.3 de la especificación. */
export type ActivityEntry = {
  entity: ActivityEntity;
  /** Fija la acción; sin ella: POST created, PATCH/PUT updated, DELETE deleted. */
  action?: ActivityAction | ((before: Snapshot | null, after: Snapshot | null) => ActivityAction);
  /**
   * Clave del elemento. Se llama antes de la escritura (sin respuesta) y, si dio null,
   * otra vez después con el JSON de la respuesta (elementos recién creados).
   */
  target: (c: Ctx, response?: any) => string | null | Promise<string | null>;
  load: (prisma: PrismaClient, key: string) => Promise<Snapshot | null>;
  /** Campos vigilados: se guardan con valor anterior y nuevo. */
  fields: readonly string[];
  /** true: no registrar (por ejemplo, un anexo que ya estaba completo). */
  skip?: (before: Snapshot | null, after: Snapshot | null) => boolean;
};
