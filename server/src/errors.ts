import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
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

export function errorHandler(error: Error, c: Context): Response {
  if (error instanceof AppError) {
    return c.json({ error: { code: error.code, message: error.message, ...error.extras } }, error.status as 400);
  }
  if (error instanceof ZodError) {
    return c.json({ error: { code: 'validation_error', message: 'Revisa los datos ingresados', fields: zodFields(error) } }, 400);
  }
  const status = error instanceof HTTPException ? error.status : undefined;
  if (status === 413) {
    return c.json({ error: { code: 'file_too_large', message: 'El archivo supera el límite de 25 MB' } }, 413);
  }
  if (status && status >= 400 && status < 500) {
    return c.json({ error: { code: 'bad_request', message: 'Solicitud inválida' } }, status);
  }
  console.error(error);
  return c.json({ error: { code: 'internal_error', message: 'Ocurrió un error interno. Inténtalo de nuevo.' } }, 500);
}

export function notFoundHandler(c: Context): Response {
  return c.json({ error: { code: 'not_found', message: 'No encontrado' } }, 404);
}
