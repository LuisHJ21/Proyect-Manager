import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { isAllowedFile, MAX_FILE_BYTES, uploadRequestSchema } from '@pm/shared';
import type { Attachment } from '@prisma/client';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, forbidden, notFound } from '../errors';
import { contentDisposition, normalizeUploadName } from '../files';
import { readBody, type App, type Ctx } from '../http';
import { getTaskAccess } from './tasks';

const uploadedByInclude = { uploadedBy: { select: { id: true, name: true } } };

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

/** Paso 1: crea el anexo pendiente y devuelve la dirección a la que el navegador envía el archivo. */
async function requestUpload(c: Ctx, projectId: string, taskId: string | null) {
  const { prisma, files } = c.var.deps;
  const input = uploadRequestSchema.parse(await readBody(c));
  const originalName = normalizeUploadName(input.filename);
  if (!isAllowedFile(originalName, input.mimeType)) {
    throw new AppError(415, 'file_type_not_allowed', 'Este tipo de archivo no está permitido');
  }

  const attachment = await prisma.attachment.create({
    data: {
      projectId,
      taskId,
      uploadedById: requireUser(c).id,
      originalName,
      storedName: randomUUID(),
      mimeType: input.mimeType,
      size: input.size,
    },
    include: uploadedByInclude,
  });
  try {
    const upload = await files.createUpload(attachment.storedName, attachment.mimeType);
    return { attachment: toDto(attachment), upload };
  } catch (error) {
    await prisma.attachment.delete({ where: { id: attachment.id } });
    throw error;
  }
}

async function list(c: Ctx, where: { projectId: string; taskId: string | null }) {
  const items = await c.var.deps.prisma.attachment.findMany({
    where: { ...where, uploadedAt: { not: null } },
    include: uploadedByInclude,
    orderBy: { createdAt: 'asc' },
  });
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

  app.post('/api/projects/:id/attachments', async (c) => {
    const project = await requireProjectPm(c, c.req.param('id'));
    return c.json(await requestUpload(c, project.id, null), 201);
  });

  app.get('/api/tasks/:id/attachments', async (c) => {
    const { task } = await getTaskAccess(c, c.req.param('id'));
    return c.json(await list(c, { projectId: task.projectId, taskId: task.id }));
  });

  app.post('/api/tasks/:id/attachments', async (c) => {
    const { task, isPm, isAssignee } = await getTaskAccess(c, c.req.param('id'));
    if (!isPm && !isAssignee) throw forbidden('Solo puedes adjuntar archivos a las tareas que tienes asignadas');
    return c.json(await requestUpload(c, task.projectId, task.id), 201);
  });

  /** Paso 3: comprueba que el archivo llegó y su tamaño real; el anexo queda visible. */
  app.post('/api/attachments/:id/complete', async (c) => {
    const { prisma, files } = c.var.deps;
    const user = requireUser(c);
    const attachment = await findAttachment(c, c.req.param('id'));
    await getProjectAccess(c, attachment.projectId);
    if (attachment.uploadedById !== user.id) throw forbidden('Solo quien subió el archivo puede confirmarlo');

    if (!attachment.uploadedAt) {
      const stored = await files.stat(attachment.storedName);
      if (!stored) throw new AppError(409, 'upload_missing', 'El archivo no llegó a subirse. Inténtalo de nuevo.');
      if (stored.size > MAX_FILE_BYTES) {
        await files.remove([attachment.storedName]);
        await prisma.attachment.delete({ where: { id: attachment.id } });
        throw new AppError(413, 'file_too_large', 'El archivo supera el límite de 25 MB');
      }
      await prisma.attachment.update({ where: { id: attachment.id }, data: { uploadedAt: c.var.deps.now(), size: stored.size } });
    }
    return c.json(toDto(await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id }, include: uploadedByInclude })));
  });

  app.get('/api/attachments/:id/download', async (c) => {
    requireUser(c);
    const { files } = c.var.deps;
    const attachment = await findAttachment(c, c.req.param('id'));
    await getProjectAccess(c, attachment.projectId);
    if (!attachment.uploadedAt) throw notFound('Anexo no encontrado');

    if (!(await files.stat(attachment.storedName))) {
      throw new AppError(404, 'attachment_file_missing', 'El archivo ya no está disponible en el servidor');
    }
    const target = await files.download(attachment.storedName, attachment.originalName);
    if ('redirect' in target) return c.redirect(target.redirect, 302);
    return new Response(Readable.toWeb(target.stream) as unknown as globalThis.ReadableStream, {
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
    await c.var.deps.files.remove([attachment.storedName]);
    return c.json({ ok: true });
  });
}
