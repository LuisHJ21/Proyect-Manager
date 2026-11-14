import { Readable } from 'node:stream';
import { MAX_FILE_BYTES } from '@pm/shared';
import { bodyLimit } from 'hono/body-limit';
import { requireUser } from '../auth/guards';
import { AppError, notFound } from '../errors';
import type { App } from '../http';
import type { DiskFileStore } from '../storage/diskFileStore';

/**
 * Paso 2 de la subida cuando los anexos van a disco (desarrollo y pruebas): hace el papel de la
 * dirección firmada de Supabase. Solo acepta el archivo de un anexo pendiente de quien lo pidió.
 */
export function localUploadRoutes(app: App, files: DiskFileStore) {
  const limit = bodyLimit({
    maxSize: MAX_FILE_BYTES,
    onError: () => {
      throw new AppError(413, 'file_too_large', 'El archivo supera el límite de 25 MB');
    },
  });

  app.put('/api/local-uploads/:storedName', limit, async (c) => {
    const user = requireUser(c);
    const storedName = c.req.param('storedName');
    const pending = await c.var.deps.prisma.attachment.findFirst({
      where: { storedName, uploadedById: user.id, uploadedAt: null },
      select: { id: true },
    });
    if (!pending) throw notFound('Subida no encontrada');
    const body = c.req.raw.body;
    await files.put(storedName, body ? Readable.fromWeb(body as import('node:stream/web').ReadableStream) : Buffer.alloc(0));
    return c.json({ ok: true });
  });
}
