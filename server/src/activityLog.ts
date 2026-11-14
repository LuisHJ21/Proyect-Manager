import type { ActivityAction } from '@pm/shared';
import { ACTIVITY_TABLE } from './activity/table';
import { diffSnapshots, type Snapshot } from './domain/activityDiff';
import type { App } from './http';
import { idOf, projectIdOf, routePatternOf, WRITE_METHODS } from './routeContext';

const DEFAULT_ACTION: Record<string, ActivityAction> = { POST: 'created', PATCH: 'updated', PUT: 'updated', DELETE: 'deleted' };

async function responseJson(res: Response): Promise<unknown> {
  if (!res.headers.get('content-type')?.includes('application/json')) return undefined;
  try {
    return await res.clone().json();
  } catch {
    return undefined;
  }
}

/**
 * Bitácora de actividad: cada escritura con respuesta 2xx que tenga entrada en `ACTIVITY_TABLE` deja un registro.
 * Va después de los guardias, así que solo ve lo que ellos dejaron pasar. El registro se guarda antes de
 * responder (la API corre en funciones sin servidor) y, si falla, la respuesta sale igual.
 */
export function registerActivityLog(app: App) {
  app.use('/api/*', async (c, next) => {
    const user = c.var.user;
    const pattern = user && WRITE_METHODS.has(c.req.method) ? routePatternOf(c) : null;
    const entry = pattern ? ACTIVITY_TABLE[`${c.req.method} ${pattern}`] : undefined;
    if (!user || !pattern || !entry) return next();

    const { prisma } = c.var.deps;
    let projectId: string | null = null;
    let key: string | null = null;
    let before: Snapshot | null = null;
    try {
      const id = idOf(c);
      projectId = id ? await projectIdOf(prisma, id, pattern) : null;
      key = await entry.target(c);
      before = key ? await entry.load(prisma, key) : null;
    } catch (error) {
      console.error('bitácora: no se pudo leer el estado anterior', error);
    }

    await next();
    if (c.res.status < 200 || c.res.status >= 300) return;

    try {
      const response = await responseJson(c.res);
      key ??= await entry.target(c, response);
      if (!projectId && pattern === '/api/projects') projectId = (response as { id?: string } | undefined)?.id ?? null;
      if (!projectId || !key) return;
      const after = c.req.method === 'DELETE' ? null : await entry.load(prisma, key);
      if (entry.skip?.(before, after)) return;
      const action = typeof entry.action === 'function' ? entry.action(before, after) : (entry.action ?? DEFAULT_ACTION[c.req.method]!);
      await prisma.activityLog.create({
        data: {
          projectId,
          userId: user.id,
          action,
          entity: entry.entity,
          entityId: key,
          entityLabel: (after ?? before)?.label ?? '',
          changes: diffSnapshots(before, after, entry.fields),
        },
      });
    } catch (error) {
      console.error('bitácora: no se pudo guardar el registro', error);
    }
  });
}
