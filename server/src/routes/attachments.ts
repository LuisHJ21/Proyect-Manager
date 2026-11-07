import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAllowedFile } from '@pm/shared';
import type { Attachment } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getProjectAccess, requireProjectPm } from '../auth/access';
import { requireUser } from '../auth/guards';
import { AppError, forbidden, notFound } from '../errors';
import { contentDisposition, normalizeUploadName, removeStoredFiles, saveUpload, storedFilePath } from '../files';
import { getTaskAccess } from './tasks';

type IdParams = { Params: { id: string } };

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

export async function attachmentRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const receive = async (req: FastifyRequest, projectId: string, taskId: string | null) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'file_required', 'Selecciona un archivo');

    const originalName = normalizeUploadName(file.filename);
    if (!isAllowedFile(originalName, file.mimetype)) {
      file.file.resume();
      throw new AppError(415, 'file_type_not_allowed', 'Este tipo de archivo no está permitido');
    }

    const { storedName, size, truncated } = await saveUpload(app.dataDir, file.file);
    if (truncated) {
      await removeStoredFiles(app.dataDir, [storedName]);
      throw new AppError(413, 'file_too_large', 'El archivo supera el límite de 25 MB');
    }

    try {
      const attachment = await prisma.attachment.create({
        data: { projectId, taskId, uploadedById: requireUser(req).id, originalName, storedName, mimeType: file.mimetype, size },
        include: uploadedByInclude,
      });
      return toDto(attachment);
    } catch (error) {
      await removeStoredFiles(app.dataDir, [storedName]);
      throw error;
    }
  };

  const list = async (where: { projectId: string; taskId: string | null }) => {
    const items = await prisma.attachment.findMany({ where, include: uploadedByInclude, orderBy: { createdAt: 'asc' } });
    return items.map(toDto);
  };

  const findAttachment = async (id: string) => {
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw notFound('Anexo no encontrado');
    return attachment;
  };

  app.get<IdParams>('/api/projects/:id/attachments', async (req) => {
    const { project } = await getProjectAccess(req, req.params.id);
    return list({ projectId: project.id, taskId: null });
  });

  app.post<IdParams>('/api/projects/:id/attachments', async (req, reply) => {
    const project = await requireProjectPm(req, req.params.id);
    return reply.status(201).send(await receive(req, project.id, null));
  });

  app.get<IdParams>('/api/tasks/:id/attachments', async (req) => {
    const { task } = await getTaskAccess(req, req.params.id);
    return list({ projectId: task.projectId, taskId: task.id });
  });

  app.post<IdParams>('/api/tasks/:id/attachments', async (req, reply) => {
    const { task, isPm, isAssignee } = await getTaskAccess(req, req.params.id);
    if (!isPm && !isAssignee) throw forbidden('Solo puedes adjuntar archivos a las tareas que tienes asignadas');
    return reply.status(201).send(await receive(req, task.projectId, task.id));
  });

  app.get<IdParams>('/api/attachments/:id/download', async (req, reply) => {
    requireUser(req);
    const attachment = await findAttachment(req.params.id);
    await getProjectAccess(req, attachment.projectId);

    const path = storedFilePath(app.dataDir, attachment.storedName);
    try {
      await access(path);
    } catch {
      throw new AppError(404, 'attachment_file_missing', 'El archivo ya no está disponible en el servidor');
    }

    return reply
      .header('content-disposition', contentDisposition(attachment.originalName))
      .header('x-content-type-options', 'nosniff')
      .type('application/octet-stream')
      .send(createReadStream(path));
  });

  app.delete<IdParams>('/api/attachments/:id', async (req) => {
    const user = requireUser(req);
    const attachment = await findAttachment(req.params.id);
    const { isPm } = await getProjectAccess(req, attachment.projectId);
    if (!isPm && attachment.uploadedById !== user.id) throw forbidden('Solo puedes eliminar los anexos que subiste');
    await prisma.attachment.delete({ where: { id: attachment.id } });
    await removeStoredFiles(app.dataDir, [attachment.storedName]);
    return { ok: true };
  });
}
