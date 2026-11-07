export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, any>,
  ) {
    super(message);
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
};

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'same-origin' };
  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'content-type': 'application/json' };
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.');
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) return payload as T;

  const error = payload?.error;
  if (!error) throw new ApiError(response.status, 'server_error', 'El servidor no respondió correctamente. Inténtalo de nuevo.');
  if (error.code === 'unauthenticated') window.dispatchEvent(new Event('pm:unauthenticated'));
  throw new ApiError(response.status, error.code, error.message, error.fields, error.details);
}

/**
 * Decide si un error debe reemplazar la pantalla. Un fallo al refrescar datos que ya se ven
 * no debe borrar lo que la persona está escribiendo, salvo que el recurso ya no exista.
 */
export function isBlockingError(query: { isError: boolean; data: unknown; error: unknown }): boolean {
  if (!query.isError) return false;
  return query.data === undefined || (query.error instanceof ApiError && query.error.status === 404);
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado';
