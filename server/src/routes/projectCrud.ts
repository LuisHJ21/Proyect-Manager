import type { Project } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
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
  delegate: Delegate;
  createSchema: ZodType<object, any, any>;
  updateSchema: ZodType<object, any, any>;
  readAccess: 'member' | 'pm';
  /** Reglas sobre el registro resultante, ya combinado con lo guardado. */
  validate?: (merged: Record<string, any>, project: Project) => Promise<void>;
  toDto?: (item: any) => object;
  /** Campos con formato: se limpian antes de validar. */
  richTextFields?: readonly string[];
  /** Relaciones que se devuelven con cada registro. */
  include?: object;
};

export function registerProjectCrud(app: FastifyInstance, options: ProjectCrudOptions) {
  const { path, delegate, createSchema, updateSchema, readAccess, validate, toDto = (item) => item, richTextFields = [], include } = options;
  const base = `/api/projects/:id/${path}`;

  const findItem = async (projectId: string, itemId: string) => {
    const item = await delegate.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw notFound();
    return item;
  };

  app.get<{ Params: { id: string } }>(base, async (req) => {
    const { project, isPm } = await getProjectAccess(req, req.params.id);
    if (readAccess === 'pm' && !isPm) throw forbidden();
    const items = await delegate.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' }, include });
    return items.map(toDto);
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    const input = createSchema.parse(sanitizeFields(req.body, richTextFields));
    await validate?.(input, project);
    const item = await delegate.create({ data: { ...input, projectId: project.id }, include });
    return reply.status(201).send(toDto(item));
  });

  app.patch<{ Params: Params }>(`${base}/:itemId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const current = await findItem(project.id, req.params.itemId);
    const input = updateSchema.parse(sanitizeFields(req.body, richTextFields));
    await validate?.({ ...current, ...input }, project);
    const item = await delegate.update({ where: { id: current.id }, data: input, include });
    return toDto(item);
  });

  app.delete<{ Params: Params }>(`${base}/:itemId`, async (req) => {
    const project = await requireProjectPm(req, req.params.id);
    const current = await findItem(project.id, req.params.itemId);
    await delegate.delete({ where: { id: current.id } });
    return { ok: true };
  });
}
