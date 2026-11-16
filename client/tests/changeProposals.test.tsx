import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, collaborator, mockApi, renderApp, signedInAs } from './helpers';

const project = { id: 'p1', name: 'Portal', description: '', status: 'EXECUTING', approach: 'AGILE', startDate: null, endDate: null };
const proposal = (over: object = {}) => ({
  id: 'cr2',
  number: 2,
  title: 'Agregar blog',
  description: 'Un blog en el sitio',
  status: 'PENDING',
  decisionNote: '',
  decidedAt: null,
  decidedBy: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  ...over,
});
const decided = proposal({ id: 'cr1', number: 1, title: 'Quitar reportes', status: 'REJECTED', decisionNote: 'Fuera de alcance', decidedAt: '2026-11-09T10:00:00.000Z', decidedBy: { id: 'pm', name: 'Paula' } });
const url = '/api/projects/p1/change-requests';
const base = { ...signedInAs(collaborator), 'GET /api/projects/p1': project, [`GET ${url}`]: [proposal(), decided] };
const open = () => renderApp('/proyectos/p1/cambios');

describe('propuestas de cambio del colaborador', () => {
  it('ve la pestaña y la lista de sus propuestas, sin impactos ni decisiones', async () => {
    const api = mockApi(base);
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Secciones del proyecto' });
    expect(within(tabs).getByRole('link', { name: 'Control de cambios' })).toBeInTheDocument();
    expect(await screen.findByText('CR-2')).toBeInTheDocument();
    expect(screen.getByText('Agregar blog')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Rechazada')).toBeInTheDocument();
    expect(screen.getByText('Fuera de alcance')).toBeInTheDocument();
    expect(screen.getByText(/Decidió Paula/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir cambio' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Impacto/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(api.calls.some((c) => c.key.includes('/decisions'))).toBe(false);
  });

  it('propone un cambio con título y descripción', async () => {
    const api = mockApi({ ...base, [`POST ${url}`]: proposal({ id: 'cr3', number: 3, title: 'Buscador' }) });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Proponer cambio' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Título'), 'Buscador');
    await user.type(within(dialog).getByLabelText('Descripción'), 'Para encontrar páginas');
    const gets = () => api.calls.filter((c) => c.key === `GET ${url}`).length;
    const before = gets();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.calls.find((c) => c.key === `POST ${url}`)?.body).toEqual({ title: 'Buscador', description: 'Para encontrar páginas', requirementIds: [] }));
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un error del título se muestra en el campo', async () => {
    mockApi({ ...base, [`POST ${url}`]: apiError(400, 'validation', { message: 'Revisa los campos', fields: { title: 'Escribe el título' } }) });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Proponer cambio' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Escribe el título')).toBeInTheDocument();
  });

  it('en un proyecto cerrado no se propone', async () => {
    mockApi({ ...base, 'GET /api/projects/p1': { ...project, status: 'CLOSED' } });
    open();
    expect(await screen.findByText('CR-2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proponer cambio' })).not.toBeInTheDocument();
  });
});
