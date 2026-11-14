import type { PrismaClient, Project } from '@prisma/client';
import type { ZodType } from 'zod';
import { readBody, type App, type Ctx } from '../http';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { forbidden, notFound } from '../errors';
import { sanitizeFields } from '../richText';

/** Subconjunto de un delegado de Prisma: los delegados no comparten un tipo genérico. */
type Delegate = {
  findMany(args: object): Promise<any[]>;
  findFirst(args: object): Promise<any | null>;
  create(args: object): Promise<any>;
  update(args: object): Promise<any>;
  delete(args: object): Promise<any>;
};

type Params = { id: string; itemId: string };

export type ProjectCrudOptions = {
  path: string;
  /** El delegado sale del cliente Prisma de cada petición. */
  delegate: (prisma: PrismaClient) => Delegate;
  createSchema: ZodType<object, any, any>;
  updateSchema: ZodType<object, any, any>;
  readAccess: 'member' | 'pm';
  /** Reglas sobre el registro resultante, ya combinado con lo guardado. */
  validate?: (merged: Record<string, any>, project: Project, prisma: PrismaClient) => Promise<void>;
  toDto?: (item: any) => object;
  /** Campos con formato: se limpian antes de validar. */
  richTextFields?: readonly string[];
  /** Relaciones que se devuelven con cada registro. */
  include?: object;
};

export function registerProjectCrud(app: App, options: ProjectCrudOptions) {
  const { path, delegate: delegateOf, createSchema, updateSchema, readAccess, validate, toDto = (item) => item, richTextFields = [], include } = options;
  const base = `/api/projects/:id/${path}`;

  const findItem = async (delegate: Delegate, projectId: string, itemId: string) => {
    const item = await delegate.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw notFound();
    return item;
  };

  app.get(base, async (c) => {
    const delegate = delegateOf(c.var.deps.prisma);
    const { project, isPm } = await getProjectAccess(c, c.req.param('id')!);
    if (readAccess === 'pm' && !isPm) throw forbidden();
    const items = await delegate.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' }, include });
    return c.json(items.map(toDto));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const delegate = delegateOf(prisma);
    const project = await requireProjectPm(c, c.req.param('id')!);
    const input = createSchema.parse(sanitizeFields(await readBody(c), richTextFields));
    await validate?.(input, project, prisma);
    const item = await delegate.create({ data: { ...input, projectId: project.id }, include });
    return c.json(toDto(item), 201);
  });

  app.patch(`${base}/:itemId`, async (c) => {
    const { prisma } = c.var.deps;
    const delegate = delegateOf(prisma);
    const project = await requireProjectPm(c, c.req.param('id')!);
    const current = await findItem(delegate, project.id, c.req.param('itemId')!);
    const input = updateSchema.parse(sanitizeFields(await readBody(c), richTextFields));
    await validate?.({ ...current, ...input }, project, prisma);
    const item = await delegate.update({ where: { id: current.id }, data: input, include });
    return c.json(toDto(item));
  });

  app.delete(`${base}/:itemId`, async (c) => {
    const delegate = delegateOf(c.var.deps.prisma);
    const project = await requireProjectPm(c, c.req.param('id')!);
    const current = await findItem(delegate, project.id, c.req.param('itemId')!);
    await delegate.delete({ where: { id: current.id } });
    return c.json({ ok: true });
  });
}
