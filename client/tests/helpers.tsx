import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthProvider';
import { ToastProvider } from '../src/components/Toast';
import { AppRoutes } from '../src/router';

export type MockError = { __status: number; code: string; message?: string; fields?: Record<string, string>; details?: object };
export const apiError = (status: number, code: string, extra: Partial<MockError> = {}): MockError => ({
  __status: status,
  code,
  message: extra.message ?? code,
  ...extra,
});

type Handler = unknown | ((body: unknown) => unknown);

/** Sustituye fetch por una tabla "MÉTODO /ruta" → respuesta. Lo no declarado responde 404. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ key, body });
    const handler = routes[key];
    const result = await (typeof handler === 'function' ? (handler as (b: unknown) => unknown)(body) : handler);
    if (result === undefined) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: `Sin simular: ${key}` } }), { status: 404 });
    }
    const failure = result as MockError;
    if (failure && failure.__status) {
      const { __status, ...error } = failure;
      return new Response(JSON.stringify({ error }), { status: __status });
    }
    return new Response(JSON.stringify(result), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, routes };
}

export const pmUser = { id: 'pm', name: 'Paula', email: 'p@x.com', role: 'PM', active: true, mustChangePassword: false };
export const collaborator = { id: 'c1', name: 'Carlos', email: 'c@x.com', role: 'COLLABORATOR', active: true, mustChangePassword: false };
export const observer = { id: 'o1', name: 'Olga', email: 'o@x.com', role: 'OBSERVER', active: true, mustChangePassword: false };

export const signedInAs = (user: object) => ({
  'GET /api/setup/status': { needsSetup: false },
  'GET /api/auth/me': user,
});

export function wrap(children: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const renderApp = (path: string) => wrap(<AppRoutes />, path);

/** Escribe en un editor con formato a través de su instancia de Tiptap, que jsdom no permite teclear. */
export async function setRichText(label: string, html: string) {
  const element = screen.getByRole('textbox', { name: label }) as HTMLElement & { editor?: { commands: { setContent: (c: string, o: object) => void } } };
  if (!element.editor) throw new Error(`El campo ${label} no es un editor con formato`);
  await act(async () => {
    element.editor!.commands.setContent(html, { emitUpdate: true });
  });
}
