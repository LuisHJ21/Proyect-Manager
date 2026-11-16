import { LESSON_CATEGORY, LESSON_TYPE, lessonSchema, updateLessonSchema } from '@pm/shared';
import type { Lesson, Prisma, User, PrismaClient } from '@prisma/client';
import { readBody, readQuery, type App, type Ctx } from '../http';
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

export function lessonRoutes(app: App) {
  const base = '/api/projects/:id/lessons';
  type ItemParams = { id: string; lessonId: string };

  const findEditable = async (prisma: PrismaClient, projectId: string, lessonId: string, viewer: User) => {
    const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, projectId } });
    if (!lesson) throw notFound('Lección no encontrada');
    if (!canEdit(lesson, viewer)) throw forbidden('Solo el autor o el Project Manager pueden cambiar esta lección');
    return lesson;
  };

  app.get(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const viewer = requireUser(c);
    const items = await prisma.lesson.findMany({ where: { projectId: project.id }, include, orderBy: { createdAt: 'desc' } });
    return c.json(items.map((l) => toLessonDto(l, viewer)));
  });

  app.post(base, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const viewer = requireUser(c);
    const input = lessonSchema.parse(await readBody(c));
    const created = await prisma.lesson.create({ data: { ...input, projectId: project.id, authorId: viewer.id }, include });
    return c.json(toLessonDto(created, viewer), 201);
  });

  app.patch(`${base}/:lessonId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const viewer = requireUser(c);
    const lesson = await findEditable(c.var.deps.prisma, project.id, c.req.param('lessonId'), viewer);
    const input = updateLessonSchema.parse(await readBody(c));
    return c.json(toLessonDto(await prisma.lesson.update({ where: { id: lesson.id }, data: input, include }), viewer));
  });

  app.delete(`${base}/:lessonId`, async (c) => {
    const { prisma } = c.var.deps;
    const { project } = await getProjectAccess(c, c.req.param('id'));
    const viewer = requireUser(c);
    const lesson = await findEditable(c.var.deps.prisma, project.id, c.req.param('lessonId'), viewer);
    await prisma.lesson.delete({ where: { id: lesson.id } });
    return c.json({ ok: true });
  });

  /** Lecciones de todos los proyectos: conocimiento de la organización, visible para cualquier usuario. */
  app.get('/api/lessons', async (c) => {
    const { prisma } = c.var.deps;
    const viewer = requireUser(c);
    const q = singleParam(readQuery(c), 'q')?.trim();
    const category = singleParam(readQuery(c), 'category', LESSON_CATEGORY);
    const type = singleParam(readQuery(c), 'type', LESSON_TYPE);
    const projectId = singleParam(readQuery(c), 'projectId');
    const items = await prisma.lesson.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
        // El observador solo consulta las lecciones de los proyectos donde es miembro; el colaborador,
        // además, las de proyectos que las comparten (C13). El PM las ve todas.
        ...(viewer.role === 'OBSERVER' ? { project: { members: { some: { userId: viewer.id } } } } : {}),
        ...(viewer.role === 'COLLABORATOR' ? { OR: [{ project: { members: { some: { userId: viewer.id } } } }, { project: { shareLessons: true } }] } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
    });
    // La búsqueda de texto se hace aquí: el LIKE de SQLite trataría % y _ como comodines
    // y solo ignora mayúsculas en ASCII. El volumen de lecciones de una instalación local es pequeño.
    const needle = q?.toLocaleLowerCase('es');
    const matches = needle ? items.filter((l) => `${l.situation} ${l.recommendation}`.toLocaleLowerCase('es').includes(needle)) : items;
    return c.json(matches.slice(0, 200).map((l) => toLessonDto(l, viewer)));
  });
}
