import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { isAllowedFile, MAX_FILE_BYTES } from '@pm/shared';
import type { Attachment } from '@prisma/client';
import { bodyLimit } from 'hono/body-limit';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, forbidden, notFound } from '../errors';
import { contentDisposition, normalizeUploadName, removeStoredFiles, saveUpload, storedFilePath } from '../files';
import type { App, Ctx } from '../http';
import { getTaskAccess } from './tasks';

const uploadedByInclude = { uploadedBy: { select: { id: true, name: true } } };

const fileTooLarge = () => new AppError(413, 'file_too_large', 'El archivo supera el límite de 25 MB');

/** Corta la lectura de cuerpos mucho mayores que el límite antes de procesarlos. */
const uploadLimit = bodyLimit({
  maxSize: MAX_FILE_BYTES + 1024 * 1024,
  onError: () => {
    throw fileTooLarge();
  },
});

function toDto(a: Attachment & { uploadedBy: { id: string; name: string } }) {
  return {
    id: a.id,
    projectId: a.projectId,
    taskId: a.taskId,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt,
  };
}

async function readFile(c: Ctx): Promise<File> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    throw new AppError(400, 'file_required', 'Selecciona un archivo');
  }
  const { file } = body;
  if (!(file instanceof File)) throw new AppError(400, 'file_required', 'Selecciona un archivo');
  return file;
}

async function receive(c: Ctx, projectId: string, taskId: string | null) {
  const { prisma, dataDir } = c.var.deps;
  const file = await readFile(c);

  const originalName = normalizeUploadName(file.name);
  if (!isAllowedFile(originalName, file.type)) {
    throw new AppError(415, 'file_type_not_allowed', 'Este tipo de archivo no está permitido');
  }
  if (file.size > MAX_FILE_BYTES) throw fileTooLarge();

  const { storedName, size } = await saveUpload(dataDir, file);
  try {
    const attachment = await prisma.attachment.create({
      data: { projectId, taskId, uploadedById: requireUser(c).id, originalName, storedName, mimeType: file.type, size },
      include: uploadedByInclude,
    });
    return toDto(attachment);
  } catch (error) {
    await removeStoredFiles(dataDir, [storedName]);
    throw error;
  }
}

async function list(c: Ctx, where: { projectId: string; taskId: string | null }) {
  const items = await c.var.deps.prisma.attachment.findMany({ where, include: uploadedByInclude, orderBy: { createdAt: 'asc' } });
  return items.map(toDto);
}

async function findAttachment(c: Ctx, id: string) {
  const attachment = await c.var.deps.prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw notFound('Anexo no encontrado');
  return attachment;
}

export function attachmentRoutes(app: App) {
  app.get('/api/projects/:id/attachments', async (c) => {
    const { project } = await getProjectAccess(c, c.req.param('id'));
    return c.json(await list(c, { projectId: project.id, taskId: null }));
  });

  app.post('/api/projects/:id/attachments', uploadLimit, async (c) => {
    const project = await requireProjectPm(c, c.req.param('id'));
    return c.json(await receive(c, project.id, null), 201);
  });

  app.get('/api/tasks/:id/attachments', async (c) => {
    const { task } = await getTaskAccess(c, c.req.param('id'));
    return c.json(await list(c, { projectId: task.projectId, taskId: task.id }));
  });

  app.post('/api/tasks/:id/attachments', uploadLimit, async (c) => {
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm && !isAssignee) throw forbidden('Solo puedes adjuntar archivos a las tareas que tienes asignadas');
    return c.json(await receive(c, task.projectId, task.id), 201);
  });

  app.get('/api/attachments/:id/download', async (c) => {
    requireUser(c);
    const attachment = await findAttachment(c, c.req.param('id'));
    await getProjectAccess(c, attachment.projectId);

    const path = storedFilePath(c.var.deps.dataDir, attachment.storedName);
    try {
      await access(path);
    } catch {
      throw new AppError(404, 'attachment_file_missing', 'El archivo ya no está disponible en el servidor');
    }

    return new Response(Readable.toWeb(createReadStream(path)) as unknown as globalThis.ReadableStream, {
      headers: {
        'content-disposition': contentDisposition(attachment.originalName),
        'x-content-type-options': 'nosniff',
        'content-type': 'application/octet-stream',
      },
    });
  });

  app.delete('/api/attachments/:id', async (c) => {
    const user = requireUser(c);
    const attachment = await findAttachment(c, c.req.param('id'));
    const { isPm } = await getProjectAccess(c, attachment.projectId);
    if (!isPm && attachment.uploadedById !== user.id) throw forbidden('Solo puedes eliminar los anexos que subiste');
    await c.var.deps.prisma.attachment.delete({ where: { id: attachment.id } });
    await removeStoredFiles(c.var.deps.dataDir, [attachment.storedName]);
    return c.json({ ok: true });
  });
}
