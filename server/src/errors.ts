import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorExtras = {
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extras: ErrorExtras = {},
  ) {
    super(message);
  }
}

export const notFound = (message = 'No encontrado') => new AppError(404, 'not_found', message);
export const forbidden = (message = 'No tienes permiso para esta acción') => new AppError(403, 'forbidden', message);
export const fieldError = (field: string, message: string, code = 'validation_error') =>
  new AppError(400, code, message, { fields: { [field]: message } });

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function errorHandler(error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.status).send({ error: { code: error.code, message: error.message, ...error.extras } });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: { code: 'validation_error', message: 'Revisa los datos ingresados', fields: zodFields(error) },
    });
  }
  const status = (error as FastifyError).statusCode;
  if (status === 413) {
    return reply.status(413).send({ error: { code: 'file_too_large', message: 'El archivo supera el límite de 25 MB' } });
  }
  if (status && status >= 400 && status < 500) {
    return reply.status(status).send({ error: { code: 'bad_request', message: 'Solicitud inválida' } });
  }
  req.log.error(error);
  return reply.status(500).send({ error: { code: 'internal_error', message: 'Ocurrió un error interno. Inténtalo de nuevo.' } });
}
