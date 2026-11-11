import { LESSON_CATEGORY, LESSON_TYPE, lessonSchema, updateLessonSchema } from '@pm/shared';
import type { Lesson, Prisma, User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { getProjectAccess } from '../auth/access';
import { requireUser } from '../auth/guards';
import { fieldError, forbidden, notFound } from '../errors';

const include = { author: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } } satisfies Prisma.LessonInclude;
type LessonWithRefs = Lesson & Prisma.LessonGetPayload<{ include: typeof include }>;

const canEdit = (lesson: Lesson, viewer: User) => viewer.role === 'PM' || lesson.authorId === viewer.id;

function toLessonDto(lesson: LessonWithRefs, viewer: User) {
  return {
    id: lesson.id,
    type: lesson.type,
    category: lesson.category,
    situation: lesson.situation,
    recommendation: lesson.recommendation,
    author: lesson.author,
    project: lesson.project,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
    canEdit: canEdit(lesson, viewer),
  };
}

/** Un parámetro de consulta opcional, único y, si se indica, dentro de la lista permitida. */
function singleParam(query: Record<string, unknown>, name: string, allowed?: readonly string[]): string | undefined {
  const value = query[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || (allowed && !allowed.includes(value))) throw fieldError(name, 'Filtro no válido');
  return value;
}

export async function lessonRoutes(app: FastifyInstance) {
  const { prisma } = app;
  const base = '/api/projects/:id/lessons';
  type ItemParams = { id: string; lessonId: string };

  const findEditable = async (projectId: string, lessonId: string, viewer: User) => {
    const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, projectId } });
    if (!lesson) throw notFound('Lección no encontrada');
    if (!canEdit(lesson, viewer)) throw forbidden('Solo el autor o el Project Manager pueden cambiar esta lección');
    return lesson;
  };

  app.get<{ Params: { id: string } }>(base, async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const viewer = requireUser(req);
    const items = await prisma.lesson.findMany({ where: { projectId: project.id }, include, orderBy: { createdAt: 'desc' } });
    return items.map((l) => toLessonDto(l, viewer));
  });

  app.post<{ Params: { id: string } }>(base, async (req, reply) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const viewer = requireUser(req);
    const input = lessonSchema.parse(req.body);
    const created = await prisma.lesson.create({ data: { ...input, projectId: project.id, authorId: viewer.id }, include });
    return reply.status(201).send(toLessonDto(created, viewer));
  });

  app.patch<{ Params: ItemParams }>(`${base}/:lessonId`, async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const viewer = requireUser(req);
    const lesson = await findEditable(project.id, req.params.lessonId, viewer);
    const input = updateLessonSchema.parse(req.body);
    return toLessonDto(await prisma.lesson.update({ where: { id: lesson.id }, data: input, include }), viewer);
  });

  app.delete<{ Params: ItemParams }>(`${base}/:lessonId`, async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    const viewer = requireUser(req);
    const lesson = await findEditable(project.id, req.params.lessonId, viewer);
    await prisma.lesson.delete({ where: { id: lesson.id } });
    return { ok: true };
  });

  /** Lecciones de todos los proyectos: conocimiento de la organización, visible para cualquier usuario. */
  app.get<{ Querystring: Record<string, unknown> }>('/api/lessons', async (req) => {
    const viewer = requireUser(req);
    const q = singleParam(req.query, 'q')?.trim();
    const category = singleParam(req.query, 'category', LESSON_CATEGORY);
    const type = singleParam(req.query, 'type', LESSON_TYPE);
    const projectId = singleParam(req.query, 'projectId');
    const items = await prisma.lesson.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
    // La búsqueda de texto se hace aquí: el LIKE de SQLite trataría % y _ como comodines
    // y solo ignora mayúsculas en ASCII. El volumen de lecciones de una instalación local es pequeño.
    const needle = q?.toLocaleLowerCase('es');
    const matches = needle ? items.filter((l) => `${l.situation} ${l.recommendation}`.toLocaleLowerCase('es').includes(needle)) : items;
    return matches.slice(0, 200).map((l) => toLessonDto(l, viewer));
  });
}
