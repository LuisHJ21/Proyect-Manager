import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client';

describe('api', () => {
  it('convierte el formato de error en ApiError con fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'email_taken', message: 'Ya existe', fields: { email: 'Ya existe' } } }), { status: 409 })),
    );
    const error = (await api('/api/users').catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('email_taken');
    expect(error.fields).toEqual({ email: 'Ya existe' });
  });

  it('un error de red da ApiError con code network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const error = (await api('/api/users').catch((e) => e)) as ApiError;
    expect(error.code).toBe('network_error');
    expect(error.status).toBe(0);
  });

  it('una respuesta que no es JSON da un error genérico en español', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    const error = (await api('/api/users').catch((e) => e)) as ApiError;
    expect(error.code).toBe('server_error');
    expect(error.message).toMatch(/servidor/i);
  });

  it('envía JSON y devuelve el cuerpo', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api('/api/x', { method: 'POST', body: { a: 1 } })).toEqual({ ok: 1 });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
  });

  it('avisa cuando la sesión termina', async () => {
    const listener = vi.fn();
    window.addEventListener('pm:unauthenticated', listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })));
    await api('/api/x').catch(() => {});
    window.removeEventListener('pm:unauthenticated', listener);
    expect(listener).toHaveBeenCalledOnce();
  });
});
