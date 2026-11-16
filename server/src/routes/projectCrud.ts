import type { PrismaClient, Project } from '@prisma/client';
import type { ZodType } from 'zod';
import { readBody, type App, type Ctx } from '../http';
import type { Section } from '@pm/shared';
import { getProjectAccess, requireProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { editConflict, forbidden, notFound } from '../errors';
import { sanitizeFields } from '../richText';

/** Subconjunto de un delegado de Prisma: los delegados no comparten un tipo genérico. */
type Delegate = {
  findMany(args: object): Promise<any[]>;
  findFirst(args: object): Promise<any | null>;
  create(args: object): Promise<any>;
  update(args: object): Promise<any>;
  updateMany(args: object): Promise<{ count: number }>;
  delete(args: object): Promise<any>;
};

type Params = { id: string; itemId: string };

export type ProjectCrudOptions = {
  path: string;
  /** El delegado sale del cliente Prisma de cada petición. */
  delegate: (prisma: PrismaClient) => Delegate;
  createSchema: ZodType<object, any, any>;
  updateSchema: ZodType<object, any, any>;
  /** Sección de la tabla de capacidades: GET exige leer y las escrituras exigen escribir. */
  section: Section;
  /** Reglas sobre el registro resultante, ya combinado con lo guardado. `current` es lo guardado; falta al crear. */
  validate?: (merged: Record<string, any>, project: Project, prisma: PrismaClient, current?: Record<string, any>) => Promise<void>;
  /** `isPm`: quien pide es PM; permite ocultar relaciones a los demás perfiles. */
  toDto?: (item: any, isPm: boolean) => object;
  /**
   * Nivel `own` de la tabla de capacidades: la persona ve los registros donde `field` es su id
   * y solo puede cambiar `editable`. El registro ajeno responde 404.
   */
  own?: { field: string; editable: readonly string[]; message: string };
  /** Campos con formato: se limpian antes de validar. */
  richTextFields?: readonly string[];
  /** Relaciones que se devuelven con cada registro. */
  include?: object;
  /** La edición exige `version` y responde 409 si otra persona guardó antes (C11). */
  versioned?: boolean;
};

export function registerProjectCrud(app: App, options: ProjectCrudOptions) {
  const { path, delegate: delegateOf, createSchema, updateSchema, section, validate, toDto = (item) => item, richTextFields = [], include, own, versioned = false } = options;
  const base = `/api/projects/:id/${path}`;

  const findItem = async (delegate: Delegate, projectId: string, itemId: string) => {
    const item = await delegate.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw notFound();
    return item;
  };

  app.get(base, async (c) => {
    const delegate = delegateOf(c.var.deps.prisma);
    const { project, can, isPm } = await getProjectAccess(c, c.req.param('id')!);
    const level = can.level(section);
    const mine = level === 'own' && own ? { [own.field]: requireUser(c).id } : null;
    if (level !== 'read' && level !== 'write' && !mine) throw forbidden();
    const items = await delegate.findMany({ where: { projectId: project.id, ...mine }, orderBy: { createdAt: 'asc' }, include });
    return c.json(items.map((item) => toDto(item, isPm)));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const delegate = delegateOf(prisma);
    const project = await requireProjectAccess(c, c.req.param('id')!, section, 'write');
    const input = createSchema.parse(sanitizeFields(await readBody(c), richTextFields));
    await validate?.(input, project, prisma);
    const item = await delegate.create({ data: { ...input, projectId: project.id }, include });
    return c.json(toDto(item, true), 201);
  });

  app.patch(`${base}/:itemId`, async (c) => {
    const { prisma } = c.var.deps;
    const delegate = delegateOf(prisma);
    const { project, can, isPm } = await getProjectAccess(c, c.req.param('id')!);
    const level = can.level(section);
    if (level !== 'write' && !(level === 'own' && own)) throw forbidden();
    const body = await readBody(c);
    if (level === 'own' && own) {
      const mine = await delegate.findFirst({ where: { id: c.req.param('itemId')!, projectId: project.id, [own.field]: requireUser(c).id } });
      if (!mine) throw notFound();
      const keys = body && typeof body === 'object' ? Object.keys(body) : [];
      if (keys.some((key) => !own.editable.includes(key))) throw forbidden(own.message);
    }
    const current = await findItem(delegate, project.id, c.req.param('itemId')!);
    const input = updateSchema.parse(sanitizeFields(body, richTextFields));
    await validate?.({ ...current, ...input }, project, prisma, current);
    if (!versioned) {
      const item = await delegate.update({ where: { id: current.id }, data: input, include });
      return c.json(toDto(item, isPm));
    }
    const { version, ...data } = input as { version: number };
    const { count } = await delegate.updateMany({ where: { id: current.id, version }, data: { ...data, version: { increment: 1 } } });
    if (count === 0) throw editConflict();
    return c.json(toDto(await delegate.findFirst({ where: { id: current.id }, include }), isPm));
  });

  app.delete(`${base}/:itemId`, async (c) => {
    const delegate = delegateOf(c.var.deps.prisma);
    const project = await requireProjectAccess(c, c.req.param('id')!, section, 'write');
    const current = await findItem(delegate, project.id, c.req.param('itemId')!);
    await delegate.delete({ where: { id: current.id } });
    return c.json({ ok: true });
  });
}
